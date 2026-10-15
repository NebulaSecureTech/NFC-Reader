// NFC Reader - Windows PC/SC bridge using only Windows WinSCard.dll and .NET Framework.
// No Node native addon, no third-party DLL, no Python at build or runtime.
// Protocol: UTF-8 lines, tab-separated, names/errors encoded as Base64, APDUs as HEX.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class WinScard {
    internal const uint ScopeSystem = 2;
    internal const uint ShareShared = 2;
    internal const uint ProtocolT0 = 1;
    internal const uint ProtocolT1 = 2;
    internal const uint LeaveCard = 0;
    internal const uint StatePresent = 0x20;
    internal const int NoReaders = unchecked((int)0x8010002E);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct ReaderState {
        [MarshalAs(UnmanagedType.LPWStr)] public string Reader;
        public IntPtr UserData;
        public uint CurrentState;
        public uint EventState;
        public uint AtrLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)] public byte[] Atr;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct IoRequest {
        public uint Protocol;
        public uint Length;
    }
    [DllImport("winscard.dll", ExactSpelling=true)]
    internal static extern int SCardEstablishContext(uint scope, IntPtr first, IntPtr second, out IntPtr context);
    [DllImport("winscard.dll", ExactSpelling=true)]
    internal static extern int SCardReleaseContext(IntPtr context);
    [DllImport("winscard.dll", EntryPoint="SCardListReadersW", CharSet=CharSet.Unicode, ExactSpelling=true)]
    internal static extern int SCardListReaders(IntPtr context, string groups, IntPtr readers, ref uint count);
    [DllImport("winscard.dll", EntryPoint="SCardGetStatusChangeW", CharSet=CharSet.Unicode, ExactSpelling=true)]
    internal static extern int SCardGetStatusChange(IntPtr context, uint timeout, [In, Out] ReaderState[] states, uint count);
    [DllImport("winscard.dll", EntryPoint="SCardConnectW", CharSet=CharSet.Unicode, ExactSpelling=true)]
    internal static extern int SCardConnect(IntPtr context, string reader, uint shareMode, uint protocols, out IntPtr card, out uint activeProtocol);
    [DllImport("winscard.dll", ExactSpelling=true)]
    internal static extern int SCardDisconnect(IntPtr card, uint disposition);
    [DllImport("winscard.dll", ExactSpelling=true)]
    internal static extern int SCardTransmit(IntPtr card, ref IoRequest sendPci, byte[] command, uint commandLength, IntPtr recvPci, [Out] byte[] response, ref uint responseLength);
}

internal sealed class Slot {
    internal string Reader;
    internal IntPtr Card = IntPtr.Zero;
    internal uint Protocol;
    internal long Token;
    internal string LastError = "";
    internal Slot(string reader) { Reader = reader; }
}

internal static class Program {
    private static readonly object Gate = new object();
    private static readonly object OutputGate = new object();
    private static readonly Dictionary<string, Slot> Slots = new Dictionary<string, Slot>(StringComparer.Ordinal);
    private static volatile bool Stop;
    private static IntPtr Context;
    private static long NextToken = 0;
    private static string LastScanError = "";

    private static string B64(string input) {
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(input ?? ""));
    }
    private static string FromB64(string input) {
        return Encoding.UTF8.GetString(Convert.FromBase64String(input));
    }
    private static void Send(string message) {
        lock (OutputGate) { Console.Out.WriteLine(message); Console.Out.Flush(); }
    }
    private static void Check(int result, string operation) {
        if (result != 0) throw new InvalidOperationException(operation + ": errore WinSCard 0x" + unchecked((uint)result).ToString("X8"));
    }
    private static string[] ListReaders() {
        uint count = 0;
        int rc = WinScard.SCardListReaders(Context, null, IntPtr.Zero, ref count);
        if (rc == WinScard.NoReaders) return new string[0];
        Check(rc, "Elenco lettori");
        if (count == 0 || count > 32768) return new string[0];
        IntPtr memory = Marshal.AllocHGlobal(checked((int)(count * 2)));
        try {
            Check(WinScard.SCardListReaders(Context, null, memory, ref count), "Elenco lettori");
            string raw = Marshal.PtrToStringUni(memory, checked((int)count));
            return raw.Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
        } finally { Marshal.FreeHGlobal(memory); }
    }
    private static bool IsPresent(string reader) {
        WinScard.ReaderState state = new WinScard.ReaderState();
        state.Reader = reader;
        state.Atr = new byte[36];
        WinScard.ReaderState[] states = new WinScard.ReaderState[] { state };
        Check(WinScard.SCardGetStatusChange(Context, 0, states, 1), "Stato lettore");
        return (states[0].EventState & WinScard.StatePresent) != 0;
    }
    private static void Disconnect(Slot slot) {
        if (slot.Card == IntPtr.Zero) return;
        try { WinScard.SCardDisconnect(slot.Card, WinScard.LeaveCard); } catch { }
        slot.Card = IntPtr.Zero;
        Send("REMOVED\t" + B64(slot.Reader) + "\t" + slot.Token.ToString());
    }
    private static void Watch() {
        while (!Stop) {
            try {
                lock (Gate) {
                    string[] found = ListReaders();
                    List<string> old = new List<string>(Slots.Keys);
                    foreach (string name in old) {
                        if (Array.IndexOf(found, name) >= 0) continue;
                        Disconnect(Slots[name]);
                        Slots.Remove(name);
                    }
                    foreach (string name in found) {
                        if (!Slots.ContainsKey(name)) Slots.Add(name, new Slot(name));
                    }
                    // SEND readers even with zero devices, but only if enumeration changed.
                    // B64 guarantees commas/tabs cannot appear in encoded names.
                    if (old.Count != Slots.Count || !SameSet(old, found)) {
                        string[] encoded = new string[found.Length];
                        for (int i = 0; i < found.Length; i++) encoded[i] = B64(found[i]);
                        Send("READERS\t" + String.Join(",", encoded));
                    }
                    foreach (string name in found) {
                        Slot slot = Slots[name];
                        bool present;
                        try { present = IsPresent(name); }
                        catch (Exception ex) {
                            Disconnect(slot);
                            if (slot.LastError != ex.Message) {
                                slot.LastError = ex.Message;
                                Send("ERROR\t" + B64(name + ": " + ex.Message));
                            }
                            continue;
                        }
                        if (!present) { Disconnect(slot); slot.LastError = ""; continue; }
                        if (slot.Card != IntPtr.Zero) continue;
                        IntPtr card;
                        uint protocol;
                        int result = WinScard.SCardConnect(Context, name, WinScard.ShareShared,
                            WinScard.ProtocolT0 | WinScard.ProtocolT1, out card, out protocol);
                        if (result != 0) {
                            string error = "Connessione " + name + ": WinSCard 0x" + unchecked((uint)result).ToString("X8");
                            if (slot.LastError != error) { slot.LastError = error; Send("ERROR\t" + B64(error)); }
                            continue;
                        }
                        slot.LastError = "";
                        slot.Card = card;
                        slot.Protocol = protocol;
                        slot.Token = ++NextToken;
                        Send("PRESENT\t" + B64(name) + "\t" + slot.Token.ToString());
                    }
                    LastScanError = "";
                }
            } catch (Exception ex) {
                if (LastScanError != ex.Message) {
                    LastScanError = ex.Message;
                    Send("ERROR\t" + B64("PC/SC: " + ex.Message));
                }
            }
            Thread.Sleep(300);
        }
    }
    private static bool SameSet(List<string> previous, string[] current) {
        if (previous.Count != current.Length) return false;
        foreach (string name in current) if (!previous.Contains(name)) return false;
        return true;
    }
    private static byte[] DecodeHex(string hex) {
        if (hex.Length < 10 || hex.Length > 520 || (hex.Length & 1) != 0) throw new InvalidOperationException("Lunghezza comando APDU non valida.");
        byte[] result = new byte[hex.Length / 2];
        for (int i = 0; i < result.Length; i++) result[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
        // Only UID, Type 2 read and write APDU used by NFC Reader.
        if (result[0] != 0xFF || (result[1] != 0xCA && result[1] != 0xB0 && result[1] != 0xD6))
            throw new InvalidOperationException("Comando APDU non autorizzato.");
        return result;
    }
    private static byte[] Transmit(string reader, long token, byte[] command) {
        lock (Gate) {
            Slot slot;
            if (!Slots.TryGetValue(reader, out slot) || slot.Card == IntPtr.Zero || slot.Token != token)
                throw new InvalidOperationException("Il tag e stato rimosso o sostituito. Avvicinalo di nuovo.");
            WinScard.IoRequest send = new WinScard.IoRequest();
            send.Protocol = slot.Protocol;
            send.Length = (uint)Marshal.SizeOf(typeof(WinScard.IoRequest));
            byte[] output = new byte[4096];
            uint received = (uint)output.Length;
            Check(WinScard.SCardTransmit(slot.Card, ref send, command, (uint)command.Length,
                IntPtr.Zero, output, ref received), "Trasmissione APDU");
            if (received < 2 || received > output.Length) throw new InvalidOperationException("Risposta APDU non valida.");
            byte[] data = new byte[received];
            Buffer.BlockCopy(output, 0, data, 0, (int)received);
            return data;
        }
    }
    private static string Hex(byte[] bytes) {
        StringBuilder b = new StringBuilder(bytes.Length * 2);
        foreach (byte item in bytes) b.Append(item.ToString("X2"));
        return b.ToString();
    }
    private static void Handle(string command) {
        string[] parts = command.Split('\t');
        if (parts.Length == 1 && parts[0] == "QUIT") { Stop = true; return; }
        if (parts.Length != 5 || parts[0] != "TRANSMIT") return;
        string id = parts[1];
        if (id.Length < 1 || id.Length > 12) return;
        try {
            long token;
            if (!long.TryParse(parts[3], out token)) throw new InvalidOperationException("Token tag non valido.");
            byte[] response = Transmit(FromB64(parts[2]), token, DecodeHex(parts[4]));
            Send("REPLY\t" + id + "\tOK\t" + Hex(response));
        } catch (Exception ex) {
            Send("REPLY\t" + id + "\tERR\t" + B64(ex.Message));
        }
    }
    public static int Main(string[] args) {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            int rc = WinScard.SCardEstablishContext(WinScard.ScopeSystem, IntPtr.Zero, IntPtr.Zero, out Context);
            Check(rc, "Servizio Smart Card Windows non disponibile");
        } catch (Exception ex) {
            Send("FATAL\t" + B64(ex.Message + ". Controlla il servizio Smart Card (SCardSvr) e il driver del lettore."));
            return 2;
        }
        Thread watcher = new Thread(Watch);
        watcher.IsBackground = true;
        watcher.Name = "NFC PCSC Reader Watch";
        watcher.Start();
        Send("READY");
        try {
            string line;
            while (!Stop && (line = Console.In.ReadLine()) != null) Handle(line);
        } catch (Exception ex) { Console.Error.WriteLine(ex.Message); }
        Stop = true;
        watcher.Join(1500);
        lock (Gate) {
            foreach (Slot slot in Slots.Values) Disconnect(slot);
            Slots.Clear();
        }
        WinScard.SCardReleaseContext(Context);
        return 0;
    }
}

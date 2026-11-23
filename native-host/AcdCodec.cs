using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace AcCarStudioHost
{
    public sealed class UnpackedAcdResult
    {
        public string KeyString { get; set; }
        public Dictionary<string, byte[]> Files { get; set; }
    }

    public sealed class PackedAcdResult
    {
        public string KeyString { get; set; }
        public byte[] Buffer { get; set; }
    }

    /// <summary>
    /// Exact Assetto Corsa data.acd Codec (Unpack &amp; Pack) matching acdCodec.ts bit-for-bit.
    /// </summary>
    public static class AcdCodec
    {
        public static string GenerateAcdKey(string carFolderName)
        {
            string s = (carFolderName ?? "").ToLowerInvariant();
            int len = s.Length;
            if (len == 0) return "0-0-0-131-66-101-171-171";

            int[] c = new int[len];
            for (int i = 0; i < len; i++) c[i] = s[i] & 0xff;

            unchecked
            {
                // Octet 0
                int n0 = 0;
                for (int i = 0; i < len; i++) n0 += c[i];
                int k0 = n0 & 0xff;

                // Octet 1
                int n1 = 0;
                for (int i = 0; i < len - 1; i += 2) n1 = (n1 * c[i]) - c[i + 1];
                int k1 = n1 & 0xff;

                // Octet 2
                int n2 = 0;
                for (int i = 1; i < len - 3; i += 3)
                {
                    int denom = c[i + 1] + 0x1b;
                    int div = denom != 0 ? (n2 * c[i]) / denom : 0;
                    n2 = div + (-0x1b - c[i - 1]);
                }
                int k2 = n2 & 0xff;

                // Octet 3
                int n3 = 0x1683;
                for (int i = 1; i < len; i++) n3 -= c[i];
                int k3 = n3 & 0xff;

                // Octet 4
                int n4 = 0x42;
                for (int i = 1; i < len - 4; i += 4)
                {
                    n4 = ((c[i] + 0x0f) * (n4 * (c[i - 1] + 0x0f))) + 0x16;
                }
                int k4 = n4 & 0xff;

                // Octet 5
                int n5 = 0x65;
                for (int i = 0; i < len - 2; i += 2) n5 -= c[i];
                int k5 = n5 & 0xff;

                // Octet 6
                int n6 = 0xab;
                for (int i = 0; i < len - 2; i += 2)
                {
                    if (c[i] != 0) n6 %= c[i];
                }
                int k6 = n6 & 0xff;

                // Octet 7
                int n7 = 0xab;
                for (int i = 0; i < len - 1; i++)
                {
                    int q = c[i] != 0 ? n7 / c[i] : 0;
                    n7 = q + c[i + 1];
                }
                int k7 = n7 & 0xff;

                return $"{k0}-{k1}-{k2}-{k3}-{k4}-{k5}-{k6}-{k7}";
            }
        }

        public static UnpackedAcdResult UnpackAcdBuffer(byte[] buffer, string carFolderName)
        {
            string keyString = GenerateAcdKey(carFolderName);
            byte[] keyCodes = Encoding.ASCII.GetBytes(keyString);
            int keyLen = keyCodes.Length;

            if (buffer == null || buffer.Length < 8)
                throw new InvalidDataException("data.acd ファイルが破損しているかサイズが小さすぎます。");

            var files = new Dictionary<string, byte[]>(StringComparer.Ordinal);
            int offset = 0;
            int firstInt = BitConverter.ToInt32(buffer, 0);
            if (firstInt < 0) offset = 8;

            while (offset + 4 <= buffer.Length)
            {
                int nameLen = BitConverter.ToInt32(buffer, offset);
                offset += 4;

                if (nameLen <= 0 || nameLen > 512 || offset + nameLen + 4 > buffer.Length)
                    throw new InvalidDataException($"data.acd の解析に失敗しました (offset={offset}, nameLen={nameLen})。");

                string fileName = Encoding.UTF8.GetString(buffer, offset, nameLen);
                offset += nameLen;

                int dataLen = BitConverter.ToInt32(buffer, offset);
                offset += 4;

                if (dataLen < 0 || offset + (long)dataLen * 4 > buffer.Length)
                    throw new InvalidDataException($"data.acd 内のエントリ \"{fileName}\" のデータ長が不正です (dataLen={dataLen})。");

                byte[] decoded = new byte[dataLen];
                for (int i = 0; i < dataLen; i++)
                {
                    byte encByte = buffer[offset + i * 4];
                    byte keyByte = keyCodes[i % keyLen];
                    decoded[i] = (byte)((encByte - keyByte) & 0xff);
                }
                offset += dataLen * 4;
                files[fileName] = decoded;
            }

            return new UnpackedAcdResult { KeyString = keyString, Files = files };
        }

        public static PackedAcdResult PackAcdBuffer(IDictionary<string, byte[]> files, string carFolderName)
        {
            string keyString = GenerateAcdKey(carFolderName);
            byte[] keyCodes = Encoding.ASCII.GetBytes(keyString);
            int keyLen = keyCodes.Length;

            var names = files.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList();
            int totalSize = 0;
            var encodedNames = new List<byte[]>(names.Count);

            foreach (string name in names)
            {
                byte[] nb = Encoding.UTF8.GetBytes(name);
                encodedNames.Add(nb);
                totalSize += 4 + nb.Length + 4 + files[name].Length * 4;
            }

            byte[] output = new byte[totalSize];
            int offset = 0;

            for (int idx = 0; idx < names.Count; idx++)
            {
                byte[] nb = encodedNames[idx];
                byte[] data = files[names[idx]];

                Buffer.BlockCopy(BitConverter.GetBytes(nb.Length), 0, output, offset, 4);
                offset += 4;

                Buffer.BlockCopy(nb, 0, output, offset, nb.Length);
                offset += nb.Length;

                Buffer.BlockCopy(BitConverter.GetBytes(data.Length), 0, output, offset, 4);
                offset += 4;

                for (int i = 0; i < data.Length; i++)
                {
                    uint encVal = (uint)((data[i] + keyCodes[i % keyLen]) & 0xff);
                    output[offset + i * 4] = (byte)(encVal & 0xff);
                    output[offset + i * 4 + 1] = 0;
                    output[offset + i * 4 + 2] = 0;
                    output[offset + i * 4 + 3] = 0;
                }
                offset += data.Length * 4;
            }

            return new PackedAcdResult { KeyString = keyString, Buffer = output };
        }
    }
}

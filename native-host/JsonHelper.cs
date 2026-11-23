using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace AcCarStudioHost
{
    public static class JsonHelper
    {
        public static JavaScriptSerializer CreateSerializer()
        {
            return new JavaScriptSerializer
            {
                MaxJsonLength = int.MaxValue,
                RecursionLimit = 256,
            };
        }

        public static string Serialize(object obj)
        {
            return CreateSerializer().Serialize(obj);
        }

        public static Dictionary<string, object> DeserializeDict(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, object>();
            return CreateSerializer().Deserialize<Dictionary<string, object>>(json)
                   ?? new Dictionary<string, object>();
        }

        public static object DeserializeAny(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            return CreateSerializer().DeserializeObject(json);
        }

        /// <summary>
        /// Sanitizes Assetto Corsa ui_car.json / ui_track.json / ui_skin.json files
        /// that often contain BOM, unescaped newlines/tabs in strings, or trailing commas.
        /// </summary>
        public static Dictionary<string, object> ParseAcJson(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return new Dictionary<string, object>();
            string cleaned = raw.TrimStart('\uFEFF').Trim();
            try
            {
                return DeserializeDict(cleaned);
            }
            catch
            {
                var sb = new StringBuilder(cleaned.Length + 32);
                bool inString = false;
                bool escaped = false;
                for (int i = 0; i < cleaned.Length; i++)
                {
                    char ch = cleaned[i];
                    if (inString)
                    {
                        if (escaped) { sb.Append(ch); escaped = false; }
                        else if (ch == '\\') { sb.Append(ch); escaped = true; }
                        else if (ch == '"') { inString = false; sb.Append(ch); }
                        else if (ch == '\n') sb.Append("\\n");
                        else if (ch == '\r') { }
                        else if (ch == '\t') sb.Append("\\t");
                        else sb.Append(ch);
                    }
                    else
                    {
                        if (ch == '"') inString = true;
                        sb.Append(ch);
                    }
                }
                string fixedJson = Regex.Replace(sb.ToString(), @",\s*([}\]])", "$1");
                try
                {
                    return DeserializeDict(fixedJson);
                }
                catch
                {
                    return new Dictionary<string, object>();
                }
            }
        }

        public static string GetString(IDictionary<string, object> d, string key, string fallback = "")
        {
            if (d == null || !d.TryGetValue(key, out object v) || v == null) return fallback;
            return Convert.ToString(v) ?? fallback;
        }

        public static bool GetBool(IDictionary<string, object> d, string key, bool fallback = false)
        {
            if (d == null || !d.TryGetValue(key, out object v) || v == null) return fallback;
            if (v is bool b) return b;
            return bool.TryParse(Convert.ToString(v), out bool parsed) ? parsed : fallback;
        }

        public static int GetInt(IDictionary<string, object> d, string key, int fallback = 0)
        {
            if (d == null || !d.TryGetValue(key, out object v) || v == null) return fallback;
            try { return Convert.ToInt32(v); } catch { return fallback; }
        }

        public static double GetDouble(IDictionary<string, object> d, string key, double fallback = 0)
        {
            if (d == null || !d.TryGetValue(key, out object v) || v == null) return fallback;
            try { return Convert.ToDouble(v); } catch { return fallback; }
        }

        public static Dictionary<string, object> GetDict(IDictionary<string, object> d, string key)
        {
            if (d == null || !d.TryGetValue(key, out object v) || v == null) return null;
            return v as Dictionary<string, object>;
        }

        public static Dictionary<string, string> GetStringMap(IDictionary<string, object> d, string key)
        {
            var res = new Dictionary<string, string>(StringComparer.Ordinal);
            var sub = GetDict(d, key);
            if (sub == null) return res;
            foreach (var kv in sub)
            {
                if (kv.Value != null) res[kv.Key] = Convert.ToString(kv.Value);
            }
            return res;
        }

        public static List<object> GetList(IDictionary<string, object> d, string key)
        {
            if (d == null || !d.TryGetValue(key, out object v) || v == null) return new List<object>();
            if (v is object[] arr) return new List<object>(arr);
            if (v is ArrayList al)
            {
                var list = new List<object>(al.Count);
                foreach (var item in al) list.Add(item);
                return list;
            }
            return new List<object>();
        }
    }
}

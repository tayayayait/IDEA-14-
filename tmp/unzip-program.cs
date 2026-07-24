using System;
using System.IO;
using System.IO.Compression;
using System.Linq;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length < 2) return 2;

        using (var zip = ZipFile.OpenRead(args[1]))
        {
            if (args[0] == "-Z1")
            {
                foreach (var entry in zip.Entries) Console.WriteLine(entry.FullName);
                return 0;
            }

            if (args[0] == "-p" && args.Length >= 3)
            {
                var entry = zip.Entries.FirstOrDefault(item => item.FullName == args[2]);
                if (entry == null) return 11;
                using (var input = entry.Open())
                using (var output = Console.OpenStandardOutput())
                {
                    input.CopyTo(output);
                    output.Flush();
                }
                return 0;
            }
        }

        return 2;
    }
}

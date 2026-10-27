using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

[assembly: AssemblyTitle("AI Usage Meter")]
[assembly: AssemblyDescription("AI Multi-Account Usage Taskbar Widget")]
[assembly: AssemblyCompany("AI Usage Meter")]
[assembly: AssemblyProduct("AI Usage Meter")]
[assembly: AssemblyVersion("1.4.0.0")]
[assembly: AssemblyFileVersion("1.4.0.0")]

namespace AiUsageMeterLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
                string electronExe = Path.Combine(baseDir, "node_modules", "electron", "dist", "electron.exe");

                if (!File.Exists(electronExe))
                {
                    return;
                }

                // 기존 잔류 electron 프로세스 정리 (재실행 시 락 충돌 원천 차단)
                try
                {
                    foreach (var proc in Process.GetProcessesByName("electron"))
                    {
                        try
                        {
                            proc.Kill();
                            proc.WaitForExit(1500);
                        }
                        catch { }
                    }
                }
                catch { }

                // SingletonLock 파일 정리
                try
                {
                    string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                    string userDataDir = Path.Combine(appData, "ai-usage-taskbar-widget");
                    if (Directory.Exists(userDataDir))
                    {
                        foreach (string lockName in new[] { "SingletonLock", "SingletonCookie", "SingletonSocket" })
                        {
                            string lockFile = Path.Combine(userDataDir, lockName);
                            if (File.Exists(lockFile))
                            {
                                try { File.Delete(lockFile); } catch { }
                            }
                        }
                    }
                }
                catch { }

                // 콘솔 창 없이 네이티브 백그라운드 GUI로 즉시 기동
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = electronExe,
                    Arguments = "\"" + baseDir + "\"",
                    WorkingDirectory = baseDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                Process.Start(psi);
            }
            catch
            {
                // Silent fail
            }
        }
    }
}

import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let url = URL(string: "http://127.0.0.1:4317")!
    private let setupCode = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    private var service: Process?
    private var output: Pipe?
    private var log = ""
    private var quitting = false
    private var failed = false
    private var ready = false
    private var timer: Timer?
    private var polls = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let item = NSMenuItem()
        let appMenu = NSMenu(title: "Consultorio")
        appMenu.addItem(withTitle: "Abrir consultorio", action: #selector(openBrowser), keyEquivalent: "o").target = self
        appMenu.addItem(withTitle: "Código de configuración…", action: #selector(showCode), keyEquivalent: "").target = self
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Salir de Consultorio", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = appMenu
        menu.addItem(item)
        NSApp.mainMenu = menu
        checkServer { exists, _ in
            if exists {
                self.alert("El consultorio ya está abierto", "Se abrirá la instancia existente. Si la iniciaste desde Terminal, ciérrala con Control+C y vuelve a abrir esta aplicación para que pueda detener el servicio al salir.")
                self.ready = true
                self.openBrowser()
            } else {
                self.startService()
            }
        }
    }

    private func startService() {
        guard let resources = Bundle.main.resourceURL else { return fail("No se encontró el contenido de la aplicación.") }
        let root = resources.appendingPathComponent("app")
        let process = Process()
        let pipe = Pipe()
        process.executableURL = root.appendingPathComponent("runtime/node")
        process.arguments = [root.appendingPathComponent("backend/src/server.js").path, "--desktop"]
        process.currentDirectoryURL = root
        var environment = ProcessInfo.processInfo.environment
        environment["CONSULTORIO_SETUP_CODE"] = setupCode
        environment["CONSULTORIO_PORT"] = "4317"
        process.environment = environment
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            let text = String(decoding: data, as: UTF8.self)
            DispatchQueue.main.async { self?.log = String(((self?.log ?? "") + text).suffix(16000)) }
        }
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self, !self.quitting else { return }
                self.fail("El servicio se detuvo.\n\n" + self.log)
            }
        }
        service = process
        output = pipe
        do { try process.run() }
        catch { return fail("No se pudo iniciar el motor incluido.\n\n" + error.localizedDescription) }
        timer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in
            guard let self = self, !self.ready, !self.quitting else { return }
            self.polls += 1
            if self.polls > 60 { return self.fail("El servicio no respondió.\n\n" + self.log) }
            self.checkServer { exists, needsSetup in
                guard exists, !self.ready, !self.quitting else { return }
                self.ready = true
                self.timer?.invalidate()
                if needsSetup { self.showCode() }
                self.openBrowser()
            }
        }
    }

    private func checkServer(_ completion: @escaping (Bool, Bool) -> Void) {
        var request = URLRequest(url: url.appendingPathComponent("api/session"))
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let value = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let valid = (response as? HTTPURLResponse)?.statusCode == 200 && value?["needsSetup"] is Bool && value?["demo"] is Bool
            DispatchQueue.main.async { completion(valid, value?["needsSetup"] as? Bool ?? false) }
        }.resume()
    }

    @objc private func openBrowser() {
        if ready { NSWorkspace.shared.open(url) }
    }

    @objc private func showCode() {
        guard service != nil else {
            alert("Configuración", "Esta instancia se inició fuera de la aplicación. El código aparece en su ventana de Terminal.")
            return
        }
        let dialog = NSAlert()
        dialog.messageText = "Código para crear la cuenta inicial"
        dialog.informativeText = setupCode + "\n\nSe copiará al portapapeles. Pégalo en el formulario del navegador. Si ya creaste una cuenta, inicia sesión con tu usuario y contraseña."
        dialog.addButton(withTitle: "Copiar y continuar")
        NSApp.activate(ignoringOtherApps: true)
        dialog.runModal()
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(setupCode, forType: .string)
    }

    private func alert(_ title: String, _ detail: String) {
        let dialog = NSAlert()
        dialog.messageText = title
        dialog.informativeText = String(detail.suffix(3000))
        dialog.addButton(withTitle: "Aceptar")
        NSApp.activate(ignoringOtherApps: true)
        dialog.runModal()
    }

    private func fail(_ detail: String) {
        guard !quitting, !failed else { return }
        failed = true
        timer?.invalidate()
        alert("No se pudo abrir Consultorio", detail)
        NSApp.terminate(nil)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openBrowser()
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        quitting = true
        timer?.invalidate()
        output?.fileHandleForReading.readabilityHandler = nil
        if let process = service, process.isRunning {
            process.terminate()
            process.waitUntilExit()
        }
    }
}

if CommandLine.arguments.contains("--version") {
    print("Consultorio macOS ARM64 " + (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "desarrollo"))
} else {
    let application = NSApplication.shared
    let delegate = AppDelegate()
    application.delegate = delegate
    application.setActivationPolicy(.regular)
    application.run()
}

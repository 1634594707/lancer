// Narrow macOS Accessibility adapter for the user-selected Doubao desktop conversation.
// No private storage, credentials, browser debugging ports, or model API are accessed.
import AppKit
import ApplicationServices
import AVFoundation
import Foundation

struct Request: Decodable {
    let action: String
    let conversationId: String?
    let text: String?
    let path: String?
}
struct Message: Encodable {
    let role: String
    let text: String
    let index: Int
}
struct Response: Encodable {
    var ok = true
    var permission = true
    var error: String?
    var conversationId: String?
    var title = ""
    var messages: [Message] = []
    var transcriptVersion = 3
    var busy = false
    var sent: Bool?
    var durationMs: Double?
    var hasVideo: Bool?
    var hasAudio: Bool?
}
struct BridgeError: Error { let code: String }
let bundleId = "com.bot.pc.doubao"
let deadline = Date().addingTimeInterval(11)
func fail(_ code: String) throws -> Never { throw BridgeError(code: code) }
func bounded() throws {
    if Date() > deadline { try fail("E_TIMEOUT") }
}
func attr(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, key as CFString, &result) == .success else { return nil }
    return result
}
func string(_ element: AXUIElement, _ key: String) -> String {
    if let value = attr(element, key) as? String { return value }
    if let url = attr(element, key) as? URL { return url.absoluteString }
    return ""
}
func elements(_ element: AXUIElement, _ key: String) -> [AXUIElement] {
    (attr(element, key) as? [AXUIElement]) ?? []
}
final class Node {
    let element: AXUIElement
    let role: String
    let title: String
    let description: String
    let value: String
    let identifier: String
    let url: String
    let enabled: Bool
    var children: [Node] = []
    weak var parent: Node?
    init(_ element: AXUIElement) {
        self.element = element
        role = string(element, kAXRoleAttribute)
        title = string(element, kAXTitleAttribute)
        description = string(element, kAXDescriptionAttribute)
        value = string(element, kAXValueAttribute)
        identifier = string(element, kAXIdentifierAttribute)
        url = string(element, kAXURLAttribute)
        enabled = (attr(element, kAXEnabledAttribute) as? Bool) ?? true
    }
    var label: String { [title, description, value, identifier].joined(separator: " ") }
    func all() -> [Node] { [self] + children.flatMap { $0.all() } }
}
func tree(_ element: AXUIElement, depth: Int = 0, count: inout Int) throws -> Node {
    try bounded()
    guard depth < 45, count < 10_000 else { try fail("E_UI_TOO_LARGE") }
    count += 1
    let node = Node(element)
    // The side workbench can contain arbitrary websites; never inspect those trees.
    if node.role == "AXWebArea", !node.url.hasPrefix("chrome://doubao-chat/chat") { return node }
    for child in elements(element, kAXChildrenAttribute) {
        let next = try tree(child, depth: depth + 1, count: &count)
        next.parent = node
        node.children.append(next)
    }
    return node
}
func conversationId(_ url: String) -> String? {
    guard let parsed = URL(string: url), parsed.scheme == "chrome", parsed.host == "doubao-chat" else { return nil }
    let parts = parsed.path.split(separator: "/")
    guard parts.count == 2, parts[0] == "chat", !parts[1].isEmpty,
          parts[1].allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
    return String(parts[1])
}
func text(_ node: Node) -> String {
    if [kAXButtonRole, kAXPopUpButtonRole, kAXTextAreaRole].contains(node.role) { return "" }
    // Parent static text often repeats its child; choose one representation only.
    if node.role == kAXStaticTextRole {
        return !node.value.isEmpty ? node.value : (!node.title.isEmpty ? node.title : node.description)
    }
    if node.role == "AXLink" {
        return !node.title.isEmpty ? node.title : (!node.description.isEmpty ? node.description : node.url)
    }
    return node.children.map(text).filter { !$0.isEmpty }.joined(separator: "\n")
}
func hasSpeak(_ node: Node) -> Bool {
    node.all().contains { $0.role == kAXButtonRole && ($0.title == "朗读" || $0.description == "朗读") }
}
func classes(_ node: Node) -> [String] {
    (attr(node.element, "AXDOMClassList") as? [String]) ?? []
}
func isUserBubble(role: String, classes: [String]) -> Bool {
    // Current Doubao nests both plain and linked user text in this bubble,
    // including collapsed history. Do not depend on its generated class suffix.
    role == kAXGroupRole && ["relative", "min-w-0", "max-w-full"].allSatisfy(classes.contains) &&
        classes.contains { $0.hasPrefix("container-") } && !classes.contains("grid")
}
func userBubble(_ turn: Node) -> Node? {
    guard classes(turn).contains("v_list_row") else { return nil }
    return turn.children.first { isUserBubble(role: $0.role, classes: classes($0)) }
}
func isMessageChrome(role: String, classes: [String], body: String) -> Bool {
    guard role == kAXGroupRole else { return false }
    if classes.contains(where: { $0.hasPrefix("message-action-bar-") }) { return true }
    if classes.contains(where: { $0.hasPrefix("trigger-") }) && ["展开全部", "收起"].contains(body) { return true }
    return ["shrink-0", "self-center", "whitespace-nowrap"].allSatisfy(classes.contains)
}
func messageText(_ turn: Node, bubble: Node?) -> String {
    // Strip only structural UI chrome, never timestamps/labels inside prose.
    // The native today/yesterday label otherwise changes the identity of a turn.
    let content = bubble ?? turn
    return content.children.filter {
        !isMessageChrome(role: $0.role, classes: classes($0), body: text($0))
    }.map(text).filter { !$0.isEmpty }.joined(separator: "\n")
}
func isRunningControl(role: String, title: String, label: String, enabled: Bool) -> Bool {
    // Body text is untrusted content, even when it literally says "正在思考".
    guard role == kAXButtonRole else { return false }
    return (!enabled && label.contains("已处理")) ||
        ["停止生成", "停止回答", "停止任务"].contains(title)
}
func isRunning(_ nodes: [Node]) -> Bool {
    nodes.contains { isRunningControl(role: $0.role, title: $0.title, label: $0.label, enabled: $0.enabled) }
}
func normalizedMessage(_ value: String) -> String { value.filter { !$0.isWhitespace } }
func matchesSentMessage(_ value: String, _ message: String) -> Bool {
    // AX may split URLs over lines or append a timestamp after the user body.
    normalizedMessage(value).hasPrefix(normalizedMessage(message))
}
func confirmsNewUserMessage(before: [Message], after: [Message], message: String) -> Bool {
    let previous = before.filter { $0.role == "user" && matchesSentMessage($0.text, message) }.count
    let current = after.filter { $0.role == "user" && matchesSentMessage($0.text, message) }.count
    // Count matching messages, not total transcript length: virtualization can remove old turns.
    // When an identical old message disappears, a same-count result is ambiguous and fails closed.
    return current > previous
}
// Evidence is deliberately local to a direct child of the confirmed transcript list.
// A bare user text node and a flat text/link user bubble have no timestamp/actions
// in Doubao's current AX tree. Tool containers do not satisfy that flat shape.
func messageRole(spoken: Bool, running: Bool, hasTime: Bool, hasActions: Bool,
                 role: String, directChildRoles: [String], wrappedUser: Bool = false) -> String? {
    // In-flight tool/progress containers are not durable conversation messages.
    if running { return nil }
    if spoken { return "assistant" }
    if wrappedUser { return "user" }
    if hasTime && hasActions { return "user" }
    if role == kAXStaticTextRole { return "user" }
    let textRoles = [kAXStaticTextRole, "AXLink"]
    if role == kAXGroupRole, !directChildRoles.isEmpty,
       directChildRoles.allSatisfy({ textRoles.contains($0) }) { return "user" }
    return nil
}
func parserSelfTest() {
    precondition(isUserBubble(role: kAXGroupRole, classes: ["relative", "min-w-0", "max-w-full", "container-example", "collapsed-example"]))
    precondition(!isUserBubble(role: kAXGroupRole, classes: ["relative", "grid", "w-full"]))
    precondition(!isUserBubble(role: kAXGroupRole, classes: ["relative", "min-w-0", "max-w-full"]))
    precondition(messageRole(spoken: false, running: false, hasTime: false, hasActions: false,
                             role: kAXGroupRole, directChildRoles: [kAXGroupRole], wrappedUser: true) == "user")
    precondition(messageRole(spoken: false, running: true, hasTime: false, hasActions: false,
                             role: kAXGroupRole, directChildRoles: [kAXGroupRole], wrappedUser: true) == nil)
    precondition(isMessageChrome(role: kAXGroupRole, classes: ["message-action-bar-example"], body: "今天 10:16"))
    precondition(isMessageChrome(role: kAXGroupRole, classes: ["trigger-example"], body: "展开全部"))
    precondition(!isMessageChrome(role: kAXStaticTextRole, classes: [], body: "今天 10:16"))
    precondition(!isMessageChrome(role: kAXGroupRole, classes: ["container-example"], body: "展开全部"))
    precondition(messageRole(spoken: false, running: false, hasTime: false, hasActions: false,
                             role: kAXStaticTextRole, directChildRoles: []) == "user")
    precondition(messageRole(spoken: false, running: false, hasTime: false, hasActions: false,
                             role: kAXGroupRole, directChildRoles: [kAXStaticTextRole, "AXLink", kAXStaticTextRole]) == "user")
    precondition(messageRole(spoken: true, running: false, hasTime: true, hasActions: true,
                             role: kAXGroupRole, directChildRoles: [kAXGroupRole, kAXButtonRole]) == "assistant")
    precondition(messageRole(spoken: false, running: true, hasTime: false, hasActions: true,
                             role: kAXGroupRole, directChildRoles: [kAXGroupRole]) == nil)
    precondition(messageRole(spoken: false, running: false, hasTime: false, hasActions: false,
                             role: kAXGroupRole, directChildRoles: [kAXGroupRole]) == nil)
    precondition(messageRole(spoken: false, running: false, hasTime: false, hasActions: true,
                             role: kAXGroupRole, directChildRoles: [kAXStaticTextRole, kAXButtonRole]) == nil)
    precondition(!isRunningControl(role: kAXStaticTextRole, title: "正在思考", label: "正在思考", enabled: true))
    precondition(!isRunningControl(role: kAXStaticTextRole, title: "正在执行代码", label: "正在执行代码", enabled: true))
    precondition(isRunningControl(role: kAXButtonRole, title: "已处理 2 秒", label: "已处理 2 秒", enabled: false))
    precondition(!isRunningControl(role: kAXButtonRole, title: "已处理 2 秒", label: "已处理 2 秒", enabled: true))
    precondition(matchesDraftValue("测试消息\n", "测试消息"))
    precondition(matchesDraftValue("第一行\n第二行\n", "第一行\n\n第二行"))
    precondition(matchesDraftValue("第一行\n第二行\n", "第一行\n第二行"))
    precondition(!matchesDraftValue("第一行第二行", "第一行\n第二行"))
    let old = Message(role: "user", text: "重复请求", index: 0)
    let answer = Message(role: "assistant", text: "完成", index: 1)
    precondition(!confirmsNewUserMessage(before: [old, answer], after: [old, answer], message: "重复请求"))
    precondition(!confirmsNewUserMessage(before: [old, answer], after: [old], message: "重复请求"))
    precondition(confirmsNewUserMessage(before: [old, answer], after: [old, answer, old], message: "重复请求"))
    let fresh = Message(role: "user", text: "本次唯一请求\n今天 11:30", index: 0)
    precondition(confirmsNewUserMessage(before: [old, answer], after: [fresh], message: "本次唯一请求"))
    precondition(!confirmsNewUserMessage(before: [], after: [Message(role: "assistant", text: "本次唯一请求", index: 0)], message: "本次唯一请求"))
    print("PASS: transcript roles, literal status text, active controls, new-send confirmation and virtualization")
}
struct View {
    let root: Node
    let web: Node
    let editor: Node?
    let input: Node?
    let response: Response
}
func snapshot(_ app: NSRunningApplication) throws -> View {
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(axApp, 0.35)
    let windows = elements(axApp, kAXWindowsAttribute)
    guard !windows.isEmpty else { try fail("E_APP_WINDOW_MISSING") }
    var candidates: [Node] = []
    for window in windows {
        var count = 0
        let root = try tree(window, count: &count)
        if root.all().contains(where: { $0.role == "AXWebArea" && $0.url.hasPrefix("chrome://doubao-chat/chat") }) {
            candidates.append(root)
        }
    }
    guard candidates.count == 1, let root = candidates.first else {
        try fail(candidates.isEmpty ? "E_APP_WINDOW_MISSING" : "E_AMBIGUOUS_WINDOW")
    }
    guard let web = root.all().first(where: { $0.role == "AXWebArea" && $0.url.hasPrefix("chrome://doubao-chat/chat") }) else { try fail("E_UI_UNSUPPORTED") }
    let nodes = web.all()
    let editor = nodes.first { [$0.title, $0.description, $0.identifier].contains("doc_editor") }
    let textAreas = nodes.filter { $0.role == kAXTextAreaRole }
    let inputs = textAreas.count == 1 ? textAreas : textAreas.filter { $0.label.contains("发消息") || string($0.element, "AXPlaceholderValue").contains("发消息") }
    let input = inputs.count == 1 ? inputs.first : nil
    var result = Response()
    result.conversationId = conversationId(web.url)
    result.title = root.title
    guard editor != nil else { try fail("E_UI_UNSUPPORTED") }
    if let editor {
        // Completed assistant turns expose a Read Aloud button in their message container.
        // Its parent's sibling containers are the rendered transcript, excluding the composer/sidebar.
        let speak = editor.all().first { $0.role == kAXButtonRole && ($0.title == "朗读" || $0.description == "朗读") }
        var messageContainer = speak?.parent
        while let node = messageContainer, text(node).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { messageContainer = node.parent }
        // A new/virtualized conversation may not have a completed assistant yet.
        // Find a list with direct user bubbles and an active assistant sibling,
        // never flatten arbitrary editor descendants into transcript messages.
        let activeList = editor.all().first { candidate in
            candidate.children.contains { child in
                messageRole(spoken: false, running: false, hasTime: false, hasActions: false,
                            role: child.role, directChildRoles: child.children.map { $0.role },
                            wrappedUser: userBubble(child) != nil) == "user"
            } && candidate.children.contains { isRunning($0.all()) }
        }
        let list = messageContainer?.parent ?? activeList
        let turns = list?.children ?? []
        // Trailing auxiliary/empty nodes and virtualized history do not define activity.
        // Only native controls within the confirmed chat editor count, never body text.
        result.busy = isRunning(editor.all())
        for turn in turns {
            let bubble = userBubble(turn)
            let body = (turn.children.isEmpty ? text(turn) : messageText(turn, bubble: bubble))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !body.isEmpty else { continue }
            let children = turn.all()
            let spoken = hasSpeak(turn)
            let running = isRunning(children)
            let hasTime = children.contains { child in
                guard child.role == kAXStaticTextRole else { return false }
                let value = child.value.isEmpty ? child.title : child.value
                return value.range(of: "^(今天|昨天|前天|[0-9]{1,4}[年/.-][0-9月/日. -]+)? ?[0-9]{1,2}:[0-9]{2}$", options: .regularExpression) != nil
            }
            let hasActions = children.contains { $0.role == kAXButtonRole }
            // Unknown partial containers are omitted; consecutive user turns never flip roles.
            guard let role = messageRole(spoken: spoken, running: running, hasTime: hasTime,
                                         hasActions: hasActions, role: turn.role,
                                         directChildRoles: turn.children.map { $0.role },
                                         wrappedUser: bubble != nil) else { continue }
            result.messages.append(Message(role: role, text: String(body.prefix(100_000)), index: result.messages.count))
        }
    }
    return View(root: root, web: web, editor: editor, input: input, response: result)
}
func checkForeground(_ app: NSRunningApplication) throws {
    try bounded()
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else { try fail("E_FOCUS_LOST") }
}
func activate(_ app: NSRunningApplication) throws {
    app.activate(options: [])
    for _ in 0..<10 {
        if NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier { return }
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }
    try fail("E_FOCUS_LOST")
}
func key(_ code: CGKeyCode, app: NSRunningApplication, flags: CGEventFlags = []) throws {
    try checkForeground(app)
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false) else { try fail("E_INPUT_FAILED") }
    down.flags = flags
    up.flags = flags
    down.postToPid(app.processIdentifier)
    up.postToPid(app.processIdentifier)
}
func click(_ node: Node, app: NSRunningApplication, coordinates: Bool = false) throws {
    try activate(app)
    if !coordinates, AXUIElementPerformAction(node.element, kAXPressAction as CFString) == .success { return }
    guard let rawPosition = attr(node.element, kAXPositionAttribute), let rawSize = attr(node.element, kAXSizeAttribute),
          CFGetTypeID(rawPosition) == AXValueGetTypeID(), CFGetTypeID(rawSize) == AXValueGetTypeID() else { try fail("E_SELECT_FAILED") }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(unsafeBitCast(rawPosition, to: AXValue.self), .cgPoint, &point),
          AXValueGetValue(unsafeBitCast(rawSize, to: AXValue.self), .cgSize, &size), size.width > 0, size.height > 0 else { try fail("E_SELECT_FAILED") }
    try checkForeground(app)
    let center = CGPoint(x: point.x + size.width / 2, y: point.y + size.height / 2)
    guard let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: center, mouseButton: .left),
          let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: center, mouseButton: .left) else { try fail("E_INPUT_FAILED") }
    down.postToPid(app.processIdentifier)
    up.postToPid(app.processIdentifier)
}
func select(_ id: String, app: NSRunningApplication) throws -> View {
    let first = try snapshot(app)
    if first.response.conversationId == id { return first }
    guard let link = first.web.all().first(where: { $0.role == "AXLink" && conversationId($0.url) == id }) else { try fail("E_SESSION_NOT_VISIBLE") }
    try click(link, app: app)
    for attempt in 0..<4 {
        Thread.sleep(forTimeInterval: 0.15)
        let view = try snapshot(app)
        if view.response.conversationId == id { return view }
        if attempt == 1,
           let freshLink = view.web.all().first(where: { $0.role == "AXLink" && conversationId($0.url) == id }) {
            // Some Chromium links acknowledge AXPress without navigating. Use their fresh bounds.
            try click(freshLink, app: app, coordinates: true)
        }
    }
    try fail("E_SELECT_FAILED")
}
func draftText(_ input: Node?) -> String {
    guard let input else { return "" }
    let value = input.value.trimmingCharacters(in: .whitespacesAndNewlines)
    // Doubao exposes its empty-editor placeholder as AXValue, including a newline.
    let placeholder = "发消息或创建任务... / 使用技能 @ 添加资料"
    if value == placeholder && input.children.allSatisfy({ text($0).trimmingCharacters(in: .whitespacesAndNewlines) == placeholder }) { return "" }
    return value
}
func checkInputFocus(_ input: Node, app: NSRunningApplication) throws {
    try checkForeground(app)
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    guard let raw = attr(axApp, kAXFocusedUIElementAttribute),
          CFGetTypeID(raw) == AXUIElementGetTypeID() else { try fail("E_FOCUS_LOST") }
    var focused = unsafeBitCast(raw, to: AXUIElement.self)
    // Chromium may focus a text descendant of the contenteditable textarea.
    for _ in 0..<8 {
        if CFEqual(focused, input.element) { return }
        guard let parent = attr(focused, kAXParentAttribute),
              CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
        focused = unsafeBitCast(parent, to: AXUIElement.self)
    }
    try fail("E_FOCUS_LOST")
}
func waitForInputFocus(_ input: Node, app: NSRunningApplication) throws {
    for _ in 0..<12 {
        try bounded()
        if (try? checkInputFocus(input, app: app)) != nil { return }
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }
    try fail("E_FOCUS_LOST")
}
func matchesDraftValue(_ value: String, _ message: String) -> Bool {
    // Chromium AX omits empty paragraph nodes; preserve non-empty line boundaries.
    func visibleLines(_ text: String) -> [String] {
        text.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n").filter { !$0.isEmpty }
    }
    return visibleLines(value) == visibleLines(message)
}
func waitForDraftValue(message: String, id: String, app: NSRunningApplication) throws -> Node {
    for _ in 0..<20 {
        try bounded()
        try checkForeground(app)
        // Chromium can update/rebuild the contenteditable after AXSetValue.
        // Observe the current composer in the bound chat, not a pre-write handle.
        let current = try snapshot(app)
        guard current.response.conversationId == id, !current.response.busy else { try fail("E_SESSION_CHANGED") }
        guard let input = current.input else { try fail("E_INPUT_MISSING") }
        if matchesDraftValue(input.value, message) {
            try checkInputFocus(input, app: app)
            return input
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }
    try fail("E_INPUT_FAILED")
}
func pasteMultiline(_ message: String, input: Node, web: Node, id: String,
                    app: NSRunningApplication) throws -> Node {
    let board = NSPasteboard.general
    let originalCount = board.changeCount
    var originalItems: [NSPasteboardItem] = []
    // Materialize every item/type before changing the pasteboard. If a promised
    // representation cannot be preserved, fail without touching the clipboard.
    for item in board.pasteboardItems ?? [] {
        let saved = NSPasteboardItem()
        for type in item.types {
            guard let data = item.data(forType: type), saved.setData(data, forType: type) else { try fail("E_INPUT_FAILED") }
        }
        originalItems.append(saved)
    }
    let payload = NSPasteboardItem()
    guard payload.setString(message, forType: .string), board.changeCount == originalCount else { try fail("E_INPUT_FAILED") }
    try waitForInputFocus(input, app: app)
    guard conversationId(string(web.element, kAXURLAttribute)) == id,
          board.changeCount == originalCount else { try fail("E_SESSION_CHANGED") }
    board.clearContents()
    var ownedCount = board.changeCount
    defer {
        // A new clipboard write by the user/another app belongs to them. Never overwrite it.
        if board.changeCount == ownedCount {
            board.clearContents()
            if !originalItems.isEmpty { _ = board.writeObjects(originalItems) }
        }
    }
    let written = board.writeObjects([payload])
    ownedCount = board.changeCount
    guard written else { try fail("E_INPUT_FAILED") }
    try waitForInputFocus(input, app: app)
    guard conversationId(string(web.element, kAXURLAttribute)) == id,
          board.changeCount == ownedCount else { try fail("E_SESSION_CHANGED") }
    // One normal paste preserves line breaks that Chromium flattens in AXSetValue.
    try key(9, app: app, flags: .maskCommand)
    return try waitForDraftValue(message: message, id: id, app: app)
}
func send(_ id: String, _ message: String, app: NSRunningApplication) throws -> Response {
    var view = try select(id, app: app)
    guard view.editor != nil else { try fail("E_UI_UNSUPPORTED") }
    guard !view.response.busy else { try fail("E_APP_BUSY") }
    guard let input = view.input else { try fail("E_INPUT_MISSING") }
    guard draftText(input).isEmpty else { try fail("E_DRAFT_PRESENT") }
    try activate(app)
    view = try snapshot(app)
    guard view.editor != nil else { try fail("E_UI_UNSUPPORTED") }
    guard view.response.conversationId == id, !view.response.busy else { try fail("E_SESSION_CHANGED") }
    guard let freshInput = view.input, draftText(freshInput).isEmpty else { try fail("E_DRAFT_PRESENT") }
    _ = AXUIElementSetAttributeValue(freshInput.element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    try waitForInputFocus(freshInput, app: app)
    // Write/paste once, then observe the actual editor state; never retry submission.
    // Chromium AX flattens multiline content, so only multiline messages use normal paste.
    let confirmedInput: Node
    if message.contains("\n") || message.contains("\r") {
        confirmedInput = try pasteMultiline(message, input: freshInput, web: view.web, id: id, app: app)
    } else {
        _ = AXUIElementSetAttributeValue(freshInput.element, kAXValueAttribute as CFString, message as CFString)
        confirmedInput = try waitForDraftValue(message: message, id: id, app: app)
    }
    guard conversationId(string(view.web.element, kAXURLAttribute)) == id else { try fail("E_SESSION_CHANGED") }
    try waitForInputFocus(confirmedInput, app: app)
    let beforeMessages = view.response.messages
    try key(36, app: app)
    for _ in 0..<5 {
        Thread.sleep(forTimeInterval: 0.15)
        let after = try snapshot(app)
        guard after.response.conversationId == id else { try fail("E_SEND_UNCONFIRMED") }
        if confirmsNewUserMessage(before: beforeMessages, after: after.response.messages, message: message) && after.input != nil && draftText(after.input).isEmpty {
            var result = after.response
            result.sent = true
            return result
        }
    }
    try fail("E_SEND_UNCONFIRMED")
}
func inspectVideo(_ path: String?) async throws -> Response {
    guard let path, path.hasPrefix("/"),
          let properties = try? FileManager.default.attributesOfItem(atPath: path),
          properties[.type] as? FileAttributeType == .typeRegular else { try fail("E_NOT_VIDEO") }
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    let seconds = CMTimeGetSeconds(try await asset.load(.duration))
    let hasVideo = !(try await asset.loadTracks(withMediaType: .video)).isEmpty
    guard hasVideo, seconds.isFinite, seconds > 0, try await asset.load(.isReadable) else { try fail("E_NOT_VIDEO") }
    var result = Response()
    result.durationMs = seconds * 1000
    result.hasVideo = hasVideo
    result.hasAudio = !(try await asset.loadTracks(withMediaType: .audio)).isEmpty
    return result
}
@MainActor func run() async throws -> Response {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count <= 200_000, let request = try? JSONDecoder().decode(Request.self, from: data),
          ["snapshot", "select", "send", "inspectVideo"].contains(request.action) else { try fail("E_BAD_REQUEST") }
    if request.action == "inspectVideo" {
        do { return try await inspectVideo(request.path) }
        catch { try fail("E_NOT_VIDEO") }
    }
    guard AXIsProcessTrusted() else { try fail("E_ACCESSIBILITY_REQUIRED") }
    let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
    guard apps.count == 1, let app = apps.first else { try fail("E_APP_NOT_RUNNING") }
    if request.action == "snapshot" { return try snapshot(app).response }
    guard let id = request.conversationId, !id.isEmpty, id.count <= 32,
          id.allSatisfy({ $0.isASCII && $0.isNumber }) else { try fail("E_BAD_REQUEST") }
    if request.action == "select" {
        try activate(app)
        return try select(id, app: app).response
    }
    guard let message = request.text, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          message.utf8.count <= 50_000 else { try fail("E_BAD_REQUEST") }
    return try send(id, message, app: app)
}
if CommandLine.arguments.dropFirst().first == "--parser-self-test" {
    parserSelfTest()
    exit(0)
}
var response: Response
do { response = try await run() }
catch {
    response = Response()
    response.ok = false
    response.error = (error as? BridgeError)?.code ?? "E_BRIDGE_FAIL"
    response.permission = response.error != "E_ACCESSIBILITY_REQUIRED"
}
if let data = try? JSONEncoder().encode(response) {
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}

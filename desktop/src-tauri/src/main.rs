fn main() {
    if std::env::args().any(|arg| arg == "--diagnostics") {
        println!("{}", handsfree_desktop::diagnostics());
        return;
    }
    handsfree_desktop::run();
}

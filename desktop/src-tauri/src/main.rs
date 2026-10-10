fn main() {
    if std::env::args().any(|arg| arg == "--diagnostics") {
        println!("{}", handsfree_desktop::diagnostics());
        return;
    }
    if std::env::args().any(|arg|arg=="--native-host"){if let Err(e)=handsfree_desktop::native_host(){eprintln!("{e}");std::process::exit(1);}return;}
    let args:Vec<String>=std::env::args().collect();if let Some(index)=args.iter().position(|a|a=="--register-extension"){if let Err(e)=handsfree_desktop::register_extension(args.get(index+1).map(String::as_str).unwrap_or("")){eprintln!("{e}");std::process::exit(1);}return;}
    handsfree_desktop::run();
}

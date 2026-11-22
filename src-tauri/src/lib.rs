mod fs_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            fs_commands::list_workspace_files,
            fs_commands::read_diagram_file,
            fs_commands::write_diagram_file,
            fs_commands::create_diagram_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

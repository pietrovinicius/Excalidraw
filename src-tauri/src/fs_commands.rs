use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TEMP_FILE_SEQ: AtomicU64 = AtomicU64::new(0);

/// Represents a directory or `.excalidraw` file inside the active workspace.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

/// Canonicalizes `workspace_path` and ensures it resolves to an existing directory.
fn canonicalize_workspace(workspace_path: &str) -> Result<PathBuf, String> {
    if workspace_path.trim().is_empty() {
        return Err("Workspace path cannot be empty".to_string());
    }
    let canonical = fs::canonicalize(workspace_path)
        .map_err(|e| format!("Failed to resolve workspace path: {e}"))?;
    if !canonical.is_dir() {
        return Err("Workspace path is not a directory".to_string());
    }
    Ok(canonical)
}

/// Returns `true` when `path` has a `.excalidraw` extension (case-insensitive).
/// Dotfiles literally named `.excalidraw` have no extension in Rust and return `false`.
fn is_excalidraw_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("excalidraw"))
}

fn is_ignored_entry(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

fn ensure_within_workspace(canonical_workspace: &Path, candidate: &Path) -> Result<(), String> {
    if !candidate.starts_with(canonical_workspace) {
        return Err("Path escapes the active workspace boundary".to_string());
    }
    Ok(())
}

fn resolve_candidate_path(canonical_workspace: &Path, file_path: &str) -> Result<PathBuf, String> {
    if file_path.trim().is_empty() {
        return Err("File path cannot be empty".to_string());
    }
    if file_path.ends_with('/') || file_path.ends_with('\\') {
        return Err("File path must reference a file, not a directory".to_string());
    }
    let raw = Path::new(file_path);
    Ok(if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        canonical_workspace.join(raw)
    })
}

fn resolve_existing_diagram_file(
    canonical_workspace: &Path,
    raw_file_path: &Path,
    candidate: &Path,
) -> Result<PathBuf, String> {
    if !is_excalidraw_path(raw_file_path) {
        return Err("Only .excalidraw files are supported".to_string());
    }
    let canonical_target = fs::canonicalize(candidate)
        .map_err(|e| format!("Failed to resolve diagram file: {e}"))?;
    ensure_within_workspace(canonical_workspace, &canonical_target)?;
    if !is_excalidraw_path(&canonical_target) {
        return Err("Resolved target is not a .excalidraw file".to_string());
    }
    if !canonical_target.is_file() {
        return Err("Target path is not a regular file".to_string());
    }
    Ok(canonical_target)
}

fn validate_nonexistent_write_target(
    canonical_workspace: &Path,
    raw_file_path: &Path,
    candidate: &Path,
) -> Result<PathBuf, String> {
    for component in raw_file_path.components() {
        match component {
            Component::ParentDir | Component::Prefix(_) => {
                return Err("File path cannot contain parent traversal or prefix".to_string());
            }
            Component::RootDir | Component::CurDir | Component::Normal(_) => {}
        }
    }

    let file_name = match raw_file_path.components().next_back() {
        Some(Component::Normal(name)) => name,
        _ => return Err("File path must end with a valid file name".to_string()),
    };

    if !is_excalidraw_path(Path::new(file_name)) {
        return Err("Only .excalidraw files are supported".to_string());
    }

    let parent = candidate
        .parent()
        .ok_or_else(|| "Target file path must have a parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|e| format!("Failed to resolve target parent directory: {e}"))?;
    ensure_within_workspace(canonical_workspace, &canonical_parent)?;
    if !canonical_parent.is_dir() {
        return Err("Target parent path is not a directory".to_string());
    }

    Ok(canonical_parent.join(file_name))
}

fn collect_directory_nodes(
    canonical_workspace: &Path,
    dir: &Path,
    visited_dirs: &mut HashSet<PathBuf>,
) -> Result<Vec<FileNode>, String> {
    let entries =
        fs::read_dir(dir).map_err(|e| format!("Failed to read directory {}: {e}", dir.display()))?;
    let mut nodes = Vec::new();

    for entry_result in entries {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_ignored_entry(&name) {
            continue;
        }

        let entry_path = entry.path();
        let canonical_entry = match fs::canonicalize(&entry_path) {
            Ok(path) => path,
            Err(_) => continue,
        };

        if !canonical_entry.starts_with(canonical_workspace) {
            continue;
        }

        if canonical_entry.is_dir() {
            if !visited_dirs.insert(canonical_entry.clone()) {
                continue;
            }
            let children =
                collect_directory_nodes(canonical_workspace, &canonical_entry, visited_dirs)?;
            nodes.push(FileNode {
                name,
                path: canonical_entry.to_string_lossy().into_owned(),
                is_dir: true,
                children: Some(children),
            });
        } else if canonical_entry.is_file()
            && is_excalidraw_path(&entry_path)
            && is_excalidraw_path(&canonical_entry)
        {
            nodes.push(FileNode {
                name,
                path: canonical_entry.to_string_lossy().into_owned(),
                is_dir: false,
                children: None,
            });
        }
    }

    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });

    Ok(nodes)
}

fn unique_temp_file_name(file_name: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = TEMP_FILE_SEQ.fetch_add(1, Ordering::Relaxed);
    format!(".{file_name}.tmp-{}-{nanos}-{seq}", std::process::id())
}

fn write_new_file_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| {
            if e.kind() == io::ErrorKind::AlreadyExists {
                format!("File already exists: {}", path.display())
            } else {
                format!("Failed to create file {}: {e}", path.display())
            }
        })?;

    let write_res = file
        .write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|e| format!("Failed to write file {}: {e}", path.display()));

    drop(file);

    if let Err(err) = write_res {
        let _ = fs::remove_file(path);
        return Err(err);
    }

    Ok(())
}

fn parse_relative_components(relative_path: &str) -> Result<Vec<&OsStr>, String> {
    if relative_path.trim().is_empty() {
        return Err("Relative path cannot be empty".to_string());
    }
    if relative_path.ends_with('/') || relative_path.ends_with('\\') {
        return Err("Relative path must reference a file, not a directory".to_string());
    }

    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err("Path must be relative to the workspace".to_string());
    }

    let mut normal_components = Vec::new();
    let mut last_was_normal = false;

    for component in path.components() {
        match component {
            Component::Normal(part) => {
                normal_components.push(part);
                last_was_normal = true;
            }
            Component::CurDir => {
                last_was_normal = false;
            }
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Relative path cannot escape workspace".to_string());
            }
        }
    }

    if normal_components.is_empty() || !last_was_normal {
        return Err("Relative path must end with a valid file name".to_string());
    }

    let file_name = *normal_components
        .last()
        .ok_or_else(|| "Relative path must include a file name".to_string())?;
    if !is_excalidraw_path(Path::new(file_name)) {
        return Err("Only .excalidraw files can be created".to_string());
    }

    Ok(normal_components)
}

fn ensure_safe_parent_dirs(
    canonical_workspace: &Path,
    dir_components: &[&OsStr],
) -> Result<PathBuf, String> {
    let mut current_dir = canonical_workspace.to_path_buf();

    for component in dir_components {
        current_dir.push(component);
        match fs::symlink_metadata(&current_dir) {
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => match fs::create_dir(&current_dir) {
                Ok(()) => {}
                Err(create_err) if create_err.kind() == io::ErrorKind::AlreadyExists => {}
                Err(create_err) => {
                    return Err(format!("Failed to create parent directory: {create_err}"));
                }
            },
            Err(e) => {
                return Err(format!("Failed to inspect parent directory: {e}"));
            }
        }

        let canonical_dir = fs::canonicalize(&current_dir)
            .map_err(|e| format!("Failed to resolve parent directory: {e}"))?;
        ensure_within_workspace(canonical_workspace, &canonical_dir)?;
        if !canonical_dir.is_dir() {
            return Err("Parent path component is not a directory".to_string());
        }
        current_dir = canonical_dir;
    }

    ensure_within_workspace(canonical_workspace, &current_dir)?;
    Ok(current_dir)
}

/// Recursively lists non-ignored directories and `.excalidraw` files inside `workspace_path`.
#[tauri::command]
pub fn list_workspace_files(workspace_path: String) -> Result<Vec<FileNode>, String> {
    let canonical_workspace = canonicalize_workspace(&workspace_path)?;
    let mut visited_dirs = HashSet::new();
    visited_dirs.insert(canonical_workspace.clone());
    collect_directory_nodes(&canonical_workspace, &canonical_workspace, &mut visited_dirs)
}

/// Reads a UTF-8 `.excalidraw` diagram file constrained to `workspace_path`.
#[tauri::command]
pub fn read_diagram_file(workspace_path: String, file_path: String) -> Result<String, String> {
    let canonical_workspace = canonicalize_workspace(&workspace_path)?;
    let candidate = resolve_candidate_path(&canonical_workspace, &file_path)?;
    let canonical_target =
        resolve_existing_diagram_file(&canonical_workspace, Path::new(&file_path), &candidate)?;
    fs::read_to_string(&canonical_target)
        .map_err(|e| format!("Failed to read diagram file {}: {e}", canonical_target.display()))
}

/// Atomically writes `content` to a `.excalidraw` file inside `workspace_path`.
#[tauri::command]
pub fn write_diagram_file(
    workspace_path: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let canonical_workspace = canonicalize_workspace(&workspace_path)?;
    let candidate = resolve_candidate_path(&canonical_workspace, &file_path)?;
    let raw_file_path = Path::new(&file_path);

    let target_path = match fs::symlink_metadata(&candidate) {
        Ok(_) => resolve_existing_diagram_file(&canonical_workspace, raw_file_path, &candidate)?,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            validate_nonexistent_write_target(&canonical_workspace, raw_file_path, &candidate)?
        }
        Err(e) => return Err(format!("Failed to inspect target file path: {e}")),
    };

    let parent_dir = target_path
        .parent()
        .ok_or_else(|| "Target file has no parent directory".to_string())?;
    let file_name = target_path
        .file_name()
        .ok_or_else(|| "Target file has no file name".to_string())?
        .to_string_lossy();
    let tmp_path = parent_dir.join(unique_temp_file_name(&file_name));

    write_new_file_synced(&tmp_path, content.as_bytes())?;

    if let Err(err) = fs::rename(&tmp_path, &target_path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed to commit diagram file write: {err}"));
    }

    Ok(())
}

/// Creates a new `.excalidraw` file at `relative_path` inside `workspace_path` without overwriting.
#[tauri::command]
pub fn create_diagram_file(workspace_path: String, relative_path: String) -> Result<String, String> {
    let canonical_workspace = canonicalize_workspace(&workspace_path)?;
    let components = parse_relative_components(&relative_path)?;
    let (file_name, parent_components) = components
        .split_last()
        .ok_or_else(|| "Relative path must include a file name".to_string())?;

    let canonical_parent = ensure_safe_parent_dirs(&canonical_workspace, parent_components)?;
    let target_path = canonical_parent.join(file_name);

    let initial_scene = serde_json::json!({
        "type": "excalidraw",
        "version": 2,
        "source": "excalidraw-desktop",
        "elements": [],
        "appState": {},
        "files": {}
    });
    let serialized = serde_json::to_string_pretty(&initial_scene)
        .map_err(|e| format!("Failed to serialize initial diagram JSON: {e}"))?;

    write_new_file_synced(&target_path, format!("{serialized}\n").as_bytes())?;
    Ok(target_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs as unix_fs;

    struct TempDirGuard {
        path: PathBuf,
        canonical: PathBuf,
    }

    impl TempDirGuard {
        fn new(prefix: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let seq = TEMP_FILE_SEQ.fetch_add(1, Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!(
                "excalidraw-desktop-{prefix}-{}-{nanos}-{seq}",
                std::process::id()
            ));
            fs::create_dir_all(&dir).expect("create temp test dir");
            let canonical = fs::canonicalize(&dir).expect("canonicalize temp test dir");
            Self {
                path: dir,
                canonical,
            }
        }

        fn workspace_arg(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TempDirGuard {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn list_workspace_files_filters_sorts_and_blocks_symlink_escapes() {
        let workspace = TempDirGuard::new("list-ws");
        let outside = TempDirGuard::new("list-outside");

        fs::create_dir(workspace.canonical.join(".git")).unwrap();
        fs::write(workspace.canonical.join(".git/ignored.excalidraw"), "{}").unwrap();
        fs::create_dir(workspace.canonical.join(".codegraph")).unwrap();
        fs::write(workspace.canonical.join(".codegraph/index.excalidraw"), "{}").unwrap();
        fs::create_dir(workspace.canonical.join("node_modules")).unwrap();
        fs::write(workspace.canonical.join("node_modules/pkg.excalidraw"), "{}").unwrap();
        fs::write(workspace.canonical.join(".excalidraw"), "{}").unwrap();
        fs::write(workspace.canonical.join(".hidden.excalidraw"), "{}").unwrap();
        fs::write(workspace.canonical.join("readme.md"), "# docs").unwrap();

        fs::create_dir(workspace.canonical.join("Zebra")).unwrap();
        fs::create_dir(workspace.canonical.join("alpha")).unwrap();
        fs::write(workspace.canonical.join("alpha/nested.excalidraw"), "{}").unwrap();
        fs::write(workspace.canonical.join("beta.excalidraw"), "{}").unwrap();
        fs::write(workspace.canonical.join("Alpha.EXCALIDRAW"), "{}").unwrap();

        fs::write(outside.canonical.join("secret.excalidraw"), "{}").unwrap();
        unix_fs::symlink(
            outside.canonical.join("secret.excalidraw"),
            workspace.canonical.join("escape.excalidraw"),
        )
        .unwrap();
        unix_fs::symlink(
            outside.canonical.as_path(),
            workspace.canonical.join("escape_dir"),
        )
        .unwrap();
        unix_fs::symlink(
            workspace.canonical.as_path(),
            workspace.canonical.join("alpha/cycle"),
        )
        .unwrap();
        unix_fs::symlink(
            workspace.canonical.join("missing.excalidraw"),
            workspace.canonical.join("broken.excalidraw"),
        )
        .unwrap();

        let nodes = list_workspace_files(workspace.workspace_arg()).unwrap();
        let names: Vec<&str> = nodes.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["alpha", "Zebra", "Alpha.EXCALIDRAW", "beta.excalidraw"]
        );

        assert!(nodes[0].is_dir);
        let alpha_children = nodes[0].children.as_ref().unwrap();
        assert_eq!(alpha_children.len(), 1);
        assert_eq!(alpha_children[0].name, "nested.excalidraw");
        assert!(!alpha_children[0].is_dir);
        assert!(alpha_children[0].children.is_none());
        assert_eq!(
            alpha_children[0].path,
            workspace
                .canonical
                .join("alpha/nested.excalidraw")
                .to_string_lossy()
        );

        assert!(nodes[1].is_dir);
        assert_eq!(nodes[1].children.as_ref().unwrap(), &Vec::<FileNode>::new());
    }

    #[test]
    fn read_diagram_file_reads_valid_utf8_and_rejects_escapes_and_bad_extensions() {
        let workspace = TempDirGuard::new("read-ws");
        let outside = TempDirGuard::new("read-outside");

        let diagram = workspace.canonical.join("flow.excalidraw");
        let expected = "{\"type\":\"excalidraw\",\"version\":2}";
        fs::write(&diagram, expected).unwrap();
        fs::write(workspace.canonical.join("notes.txt"), "plain text").unwrap();
        fs::write(workspace.canonical.join(".excalidraw"), "dotfile").unwrap();

        let outside_file = outside.canonical.join("secret.excalidraw");
        fs::write(&outside_file, "secret").unwrap();
        let symlink_escape = workspace.canonical.join("link.excalidraw");
        unix_fs::symlink(&outside_file, &symlink_escape).unwrap();

        let relative_read =
            read_diagram_file(workspace.workspace_arg(), "flow.excalidraw".to_string()).unwrap();
        assert_eq!(relative_read, expected);

        let abs_read = read_diagram_file(
            workspace.workspace_arg(),
            workspace.path.join("flow.excalidraw").to_string_lossy().into_owned(),
        )
        .unwrap();
        assert_eq!(abs_read, expected);

        assert!(read_diagram_file(workspace.workspace_arg(), "notes.txt".to_string()).is_err());
        assert!(read_diagram_file(workspace.workspace_arg(), ".excalidraw".to_string()).is_err());
        assert!(read_diagram_file(
            workspace.workspace_arg(),
            outside_file.to_string_lossy().into_owned()
        )
        .is_err());
        assert!(read_diagram_file(
            workspace.workspace_arg(),
            format!("../{}/secret.excalidraw", outside.canonical.file_name().unwrap().to_string_lossy())
        )
        .is_err());
        assert!(
            read_diagram_file(workspace.workspace_arg(), symlink_escape.to_string_lossy().into_owned())
                .is_err()
        );
    }

    #[test]
    fn write_diagram_file_writes_atomically_without_tmp_leftovers_and_rejects_escapes() {
        let workspace = TempDirGuard::new("write-ws");
        let outside = TempDirGuard::new("write-outside");

        let target = workspace.canonical.join("arch.excalidraw");
        fs::write(&target, "{\"old\":true}").unwrap();

        write_diagram_file(
            workspace.workspace_arg(),
            target.to_string_lossy().into_owned(),
            "{\"new\":true}".to_string(),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"new\":true}");

        write_diagram_file(
            workspace.workspace_arg(),
            "brand_new.excalidraw".to_string(),
            "{\"created\":1}".to_string(),
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(workspace.canonical.join("brand_new.excalidraw")).unwrap(),
            "{\"created\":1}"
        );

        let leftovers: Vec<_> = fs::read_dir(&workspace.canonical)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "leftover temp files found: {leftovers:?}");

        let outside_target = outside.canonical.join("pwn.excalidraw");
        assert!(write_diagram_file(
            workspace.workspace_arg(),
            outside_target.to_string_lossy().into_owned(),
            "{}".to_string()
        )
        .is_err());
        assert!(!outside_target.exists());

        assert!(write_diagram_file(
            workspace.workspace_arg(),
            "../pwn.excalidraw".to_string(),
            "{}".to_string()
        )
        .is_err());
        assert!(write_diagram_file(
            workspace.workspace_arg(),
            "bad.json".to_string(),
            "{}".to_string()
        )
        .is_err());
        assert!(write_diagram_file(
            workspace.workspace_arg(),
            ".excalidraw".to_string(),
            "{}".to_string()
        )
        .is_err());

        fs::write(&outside_target, "untouched").unwrap();
        let symlink_target = workspace.canonical.join("escape_write.excalidraw");
        unix_fs::symlink(&outside_target, &symlink_target).unwrap();
        assert!(write_diagram_file(
            workspace.workspace_arg(),
            symlink_target.to_string_lossy().into_owned(),
            "overwritten".to_string()
        )
        .is_err());
        assert_eq!(fs::read_to_string(&outside_target).unwrap(), "untouched");

        let dir_escape = workspace.canonical.join("escape_dir");
        unix_fs::symlink(&outside.canonical, &dir_escape).unwrap();
        assert!(write_diagram_file(
            workspace.workspace_arg(),
            "escape_dir/new_escape.excalidraw".to_string(),
            "pwn".to_string()
        )
        .is_err());
        assert!(!outside.canonical.join("new_escape.excalidraw").exists());
    }

    #[test]
    fn create_diagram_file_initializes_valid_json_refuses_overwrite_and_rejects_escapes() {
        let workspace = TempDirGuard::new("create-ws");
        let outside = TempDirGuard::new("create-outside");

        let created_path = create_diagram_file(
            workspace.workspace_arg(),
            "nested/sub/system.excalidraw".to_string(),
        )
        .unwrap();
        let expected_path = workspace.canonical.join("nested/sub/system.excalidraw");
        assert_eq!(created_path, expected_path.to_string_lossy());

        let raw_json = fs::read_to_string(&expected_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw_json).unwrap();
        assert_eq!(parsed["type"], "excalidraw");
        assert_eq!(parsed["version"], 2);
        assert_eq!(parsed["source"], "excalidraw-desktop");
        assert_eq!(parsed["elements"], serde_json::json!([]));
        assert_eq!(parsed["appState"], serde_json::json!({}));
        assert_eq!(parsed["files"], serde_json::json!({}));

        assert!(create_diagram_file(
            workspace.workspace_arg(),
            "nested/sub/system.excalidraw".to_string()
        )
        .is_err());

        assert!(create_diagram_file(
            workspace.workspace_arg(),
            "../outside.excalidraw".to_string()
        )
        .is_err());
        assert!(create_diagram_file(
            workspace.workspace_arg(),
            workspace
                .canonical
                .join("abs.excalidraw")
                .to_string_lossy()
                .into_owned()
        )
        .is_err());
        assert!(create_diagram_file(workspace.workspace_arg(), "notes.md".to_string()).is_err());
        assert!(
            create_diagram_file(workspace.workspace_arg(), ".excalidraw".to_string()).is_err()
        );

        let escape_dir = workspace.canonical.join("escape_dir");
        unix_fs::symlink(&outside.canonical, &escape_dir).unwrap();
        assert!(create_diagram_file(
            workspace.workspace_arg(),
            "escape_dir/sub/pwn.excalidraw".to_string()
        )
        .is_err());
        assert!(!outside.canonical.join("sub").exists());
    }
}

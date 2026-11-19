use super::*;

fn folder(id: &str, name: &str) -> Folder {
    Folder {
        id: id.to_string(),
        name: name.to_string(),
    }
}

#[test]
fn a_name_is_one_trimmed_line_and_never_empty() {
    assert_eq!(clean_name("  Outreach \n team ").unwrap(), "Outreach team");
    assert!(clean_name("   ").is_err());
    assert_eq!(
        clean_name(&"x".repeat(80)).unwrap().chars().count(),
        NAME_MAX
    );
}

#[test]
fn adding_a_name_already_there_is_that_folder() {
    let mut folders = vec![folder("f1", "SEO")];
    let same = add_to(&mut folders, "seo", 10).unwrap();
    assert_eq!(same.id, "f1");
    assert_eq!(folders.len(), 1);
    let new = add_to(&mut folders, "Website", 10).unwrap();
    assert_eq!(new.name, "Website");
    assert_ne!(new.id, "f1");
    assert_eq!(folders.len(), 2);
}

#[test]
fn new_ids_never_collide() {
    let mut folders = Vec::new();
    let a = add_to(&mut folders, "A", 5).unwrap();
    let b = add_to(&mut folders, "B", 5).unwrap();
    assert_ne!(a.id, b.id);
}

#[test]
fn a_folder_is_found_by_id_or_by_name_in_any_case() {
    let folders = vec![folder("f1", "SEO"), folder("f2", "Design")];
    assert_eq!(find_in(&folders, "f2").unwrap().name, "Design");
    assert_eq!(find_in(&folders, " design ").unwrap().id, "f2");
    assert!(find_in(&folders, "Outreach").is_none());
}

#[test]
fn reordering_keeps_folders_not_named_after() {
    let folders = vec![folder("a", "A"), folder("b", "B"), folder("c", "C")];
    let ids = |v: Vec<Folder>| v.into_iter().map(|f| f.id).collect::<Vec<_>>();
    assert_eq!(
        ids(in_order(&folders, &["c".into(), "a".into()])),
        ["c", "a", "b"]
    );
    assert_eq!(ids(in_order(&folders, &["gone".into()])), ["a", "b", "c"]);
}

#[test]
fn pinned_placement_reads_its_words() {
    assert_eq!(Pinned::parse("top").unwrap(), Pinned::Top);
    assert_eq!(Pinned::parse("inFolder").unwrap(), Pinned::InFolder);
    assert_eq!(Pinned::parse("in their folder").unwrap(), Pinned::InFolder);
    assert!(Pinned::parse("bottom").is_err());
    assert_eq!(Pinned::default(), Pinned::Top);
}

#[test]
fn an_old_file_reads_with_nothing_chosen() {
    let v: View = serde_json::from_str("{}").unwrap();
    assert!(v.folders.is_empty());
    assert_eq!(v.pinned, Pinned::Top);
    assert!(!v.brought_in);
}

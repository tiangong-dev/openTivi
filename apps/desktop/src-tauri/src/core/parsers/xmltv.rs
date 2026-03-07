use quick_xml::events::Event;
use quick_xml::Reader;

use crate::core::models::epg::ParsedProgram;
use crate::error::AppResult;

pub fn parse_xmltv(content: &str) -> AppResult<Vec<ParsedProgram>> {
    let mut reader = Reader::from_str(content);
    let mut programs = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) if e.name().as_ref() == b"programme" => {
                let mut channel_id = String::new();
                let mut start = String::new();
                let mut stop = String::new();

                for attr in e.attributes().flatten() {
                    match attr.key.as_ref() {
                        b"channel" => {
                            channel_id =
                                String::from_utf8_lossy(&attr.value).to_string();
                        }
                        b"start" => {
                            start = String::from_utf8_lossy(&attr.value).to_string();
                        }
                        b"stop" => {
                            stop = String::from_utf8_lossy(&attr.value).to_string();
                        }
                        _ => {}
                    }
                }

                let mut title = String::new();
                let mut desc = None;
                let mut category = None;

                // Read inner elements until </programme>
                loop {
                    match reader.read_event_into(&mut buf) {
                        Ok(Event::Start(ref inner)) => {
                            let tag = inner.name().as_ref().to_vec();
                            if let Ok(Event::Text(ref t)) = reader.read_event_into(&mut buf) {
                                let text = t.unescape().unwrap_or_default().to_string();
                                match tag.as_slice() {
                                    b"title" => title = text,
                                    b"desc" => desc = Some(text),
                                    b"category" => category = Some(text),
                                    _ => {}
                                }
                            }
                        }
                        Ok(Event::End(ref e)) if e.name().as_ref() == b"programme" => break,
                        Ok(Event::Eof) => break,
                        Err(_) => break,
                        _ => {}
                    }
                }

                if !title.is_empty() {
                    programs.push(ParsedProgram {
                        channel_tvg_id: channel_id,
                        start_at: start,
                        end_at: stop,
                        title,
                        description: desc,
                        category,
                    });
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(e.into()),
            _ => {}
        }
        buf.clear();
    }

    Ok(programs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_xmltv_basic() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <programme start="20240101060000 +0000" stop="20240101070000 +0000" channel="ch1">
    <title>Morning News</title>
    <desc>Daily news update</desc>
    <category>News</category>
  </programme>
</tv>"#;
        let programs = parse_xmltv(xml).unwrap();
        assert_eq!(programs.len(), 1);
        let p = &programs[0];
        assert_eq!(p.channel_tvg_id, "ch1");
        assert_eq!(p.start_at, "20240101060000 +0000");
        assert_eq!(p.end_at, "20240101070000 +0000");
        assert_eq!(p.title, "Morning News");
        assert_eq!(p.description.as_deref(), Some("Daily news update"));
        assert_eq!(p.category.as_deref(), Some("News"));
    }

    #[test]
    fn test_parse_xmltv_multiple_programs() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <programme start="20240101060000 +0000" stop="20240101070000 +0000" channel="ch1">
    <title>Morning News</title>
  </programme>
  <programme start="20240101070000 +0000" stop="20240101080000 +0000" channel="ch1">
    <title>Weather Report</title>
  </programme>
</tv>"#;
        let programs = parse_xmltv(xml).unwrap();
        assert_eq!(programs.len(), 2);
    }

    #[test]
    fn test_parse_xmltv_empty_title_skipped() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <programme start="20240101060000 +0000" stop="20240101070000 +0000" channel="ch1">
    <title></title>
  </programme>
</tv>"#;
        let programs = parse_xmltv(xml).unwrap();
        assert_eq!(programs.len(), 0);
    }

    #[test]
    fn test_parse_empty_xmltv() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?><tv></tv>"#;
        let programs = parse_xmltv(xml).unwrap();
        assert_eq!(programs.len(), 0);
    }
}

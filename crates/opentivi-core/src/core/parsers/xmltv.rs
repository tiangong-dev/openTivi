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
                            channel_id = String::from_utf8_lossy(&attr.value).to_string();
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

pub fn parse_xmltv_channel_aliases(content: &str) -> AppResult<Vec<(String, String)>> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);
    let mut aliases = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) if e.name().as_ref() == b"channel" => {
                let mut channel_id = String::new();
                for attr in e.attributes().flatten() {
                    if attr.key.as_ref() == b"id" {
                        channel_id = String::from_utf8_lossy(&attr.value).to_string();
                    }
                }

                loop {
                    match reader.read_event_into(&mut buf) {
                        Ok(Event::Start(ref inner)) if inner.name().as_ref() == b"display-name" => {
                            let mut display_name = String::new();
                            loop {
                                match reader.read_event_into(&mut buf) {
                                    Ok(Event::Text(t)) => {
                                        display_name
                                            .push_str(t.unescape().unwrap_or_default().as_ref());
                                    }
                                    Ok(Event::CData(c)) => {
                                        display_name.push_str(
                                            String::from_utf8_lossy(&c.into_inner()).as_ref(),
                                        );
                                    }
                                    Ok(Event::End(ref end))
                                        if end.name().as_ref() == b"display-name" =>
                                    {
                                        break;
                                    }
                                    Ok(Event::Eof) => break,
                                    Err(_) => break,
                                    _ => {}
                                }
                                buf.clear();
                            }

                            let id = channel_id.trim();
                            let name = display_name.trim();
                            if !id.is_empty() && !name.is_empty() {
                                aliases.push((id.to_string(), name.to_string()));
                            }
                        }
                        Ok(Event::End(ref end)) if end.name().as_ref() == b"channel" => break,
                        Ok(Event::Eof) => break,
                        Err(e) => return Err(e.into()),
                        _ => {}
                    }
                    buf.clear();
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(e.into()),
            _ => {}
        }
        buf.clear();
    }

    Ok(aliases)
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

    #[test]
    fn test_parse_xmltv_channel_aliases() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="101">
    <display-name>CCTV1-综合</display-name>
    <display-name>CCTV-1</display-name>
  </channel>
  <channel id="102">
    <display-name>东方卫视</display-name>
  </channel>
</tv>"#;

        let aliases = parse_xmltv_channel_aliases(xml).unwrap();
        assert_eq!(aliases.len(), 3);
        assert_eq!(aliases[0], ("101".to_string(), "CCTV1-综合".to_string()));
        assert_eq!(aliases[1], ("101".to_string(), "CCTV-1".to_string()));
        assert_eq!(aliases[2], ("102".to_string(), "东方卫视".to_string()));
    }
}

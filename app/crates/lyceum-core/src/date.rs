//! ISO civil-date handling. The pure core never reads the system clock; callers
//! pass `today` in so every computation is deterministic and testable.

use serde::{Deserialize, Deserializer, Serializer};
use time::macros::format_description;
use time::{Date, Duration};

/// Format a `Date` as `YYYY-MM-DD`.
pub fn format_iso(d: Date) -> String {
    let fmt = format_description!("[year]-[month]-[day]");
    d.format(&fmt)
        .expect("ISO date format is infallible for valid Date")
}

/// Parse a `YYYY-MM-DD` string into a `Date`.
pub fn parse_iso(s: &str) -> Result<Date, time::error::Parse> {
    let fmt = format_description!("[year]-[month]-[day]");
    Date::parse(s, &fmt)
}

/// `today + n` days (saturating at the representable bounds).
pub fn add_days(d: Date, n: i64) -> Date {
    d.saturating_add(Duration::days(n))
}

/// serde adapter for a required ISO date field.
pub mod iso {
    use super::*;

    pub fn serialize<S: Serializer>(d: &Date, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&format_iso(*d))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Date, D::Error> {
        let s = String::deserialize(d)?;
        parse_iso(&s).map_err(serde::de::Error::custom)
    }
}

/// serde adapter for an optional ISO date field.
pub mod iso_opt {
    use super::*;

    pub fn serialize<S: Serializer>(d: &Option<Date>, s: S) -> Result<S::Ok, S::Error> {
        match d {
            Some(d) => s.serialize_str(&format_iso(*d)),
            None => s.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Date>, D::Error> {
        let opt = Option::<String>::deserialize(d)?;
        match opt {
            Some(s) => parse_iso(&s).map(Some).map_err(serde::de::Error::custom),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::date;

    #[test]
    fn roundtrip() {
        let d = date!(2026 - 06 - 18);
        assert_eq!(format_iso(d), "2026-06-18");
        assert_eq!(parse_iso("2026-06-18").unwrap(), d);
    }

    #[test]
    fn add_days_crosses_month_and_year() {
        assert_eq!(add_days(date!(2026 - 06 - 18), 16), date!(2026 - 07 - 04));
        assert_eq!(add_days(date!(2026 - 12 - 31), 1), date!(2027 - 01 - 01));
    }
}

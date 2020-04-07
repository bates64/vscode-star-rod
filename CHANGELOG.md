# Changelog

## 0.5.0

Syntax highlighting:
- All struct types such as `#new:Function_GetTattle` are now recgonised
- Script keywords `Call`, `Exec`, and `ExecWait` are now highlighted in italics
- Script keywords `ConstAND`, `ConstOR`, `DoesScriptExist`, and `Kill` are now recgonised
- Phrases such as `TODO` and `FIXME` are now highlighted when they appear in comments
- The numeric suffixes `` ` ``, `b`, and `s` are now highlighted differently from the number value itself
- Fixed unknown struct types being highlighted as if they were arbitrary data
- Fixed floating-point literals using only binary digits (e.g. `10.0`) being highlighted incorrectly past the decimal point

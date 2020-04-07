# Changelog

## 0.5.1

Syntax highlighting:
- Fixed double-precision floats (e.g. `1.0d`)
- Fixed script/function lines with numeric offsets having their operation/mnemonic mishighlighted
- Fixed highlighting of pointer offsets such as `LTW v0, v0 ($MyStruct)`
- Updated numeric constant to not highlight errors such as `FFFFb` as numbers (`b`, for example, requires __at most__ 2 hex digits before it)

## 0.5.0

Syntax highlighting:
- All struct types such as `#new:Function_GetTattle` are now recgonised
- Script keywords `Call`, `Exec`, and `ExecWait` are now highlighted in italics
- Script keywords `ConstAND`, `ConstOR`, `DoesScriptExist`, and `Kill` are now recgonised
- Phrases such as `TODO` and `FIXME` are now highlighted when they appear in comments
- The numeric suffixes `` ` ``, `b`, and `s` are now highlighted differently from the number value itself
- Fixed unknown struct types being highlighted as if they were arbitrary data
- Fixed floating-point literals using only binary digits (e.g. `10.0`) being highlighted incorrectly past the decimal point

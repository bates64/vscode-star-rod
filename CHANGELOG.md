# Changelog

## 0.6.0

- Updated intellisense hugely :sparkles:
    - Function database updated to Star Rod 0.2.0
    - Hovering over `{Func:XXX}` in functions to get its documentation now works
    - Script commands (`Call`, `Set`, etc.) are now autocompleted and have attached documentation
        - This includes snippets for complex commands such as `Bind` - press Tab to have the syntax filled-in for you
    - You can also hover over script commands to see documentation and examples
    - Hovering over a raw-addressed `Call` now gives the name of the function if it is known
    - Generated function signature/documentation bugfixes
- Code folding is now "smart" rather than indentation-based
    - This includes folding `/%...%/` block comments, `#import` series, and entire structs/strings
- Indentation/unindentation occurs automatically when "If," "EndIf", etc are used
    - `#new:Script` and `#new:Function` are deliberately not indented as to do so would be inconsistent with other structs
- Script commands outside of `#new:Script`/`@` blocks anyway to reduce flicker when enter is pressed to create a newline
    - In the future, an error will be raised upon saving the file if there are script commands outside of a script block
- Fixed some syntax highlighting issues, including `#new:Data` not being recognised & PAUSE/CHOICE in strings

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

# Changelog

## 0.11.0

- Added syntax highlighting support for SR 0.3's RAM global patches e.g. `@Hook:Map`.

## 0.10.2

- Fixed indented block directives such as `@` and `#new` not being highlighted
- Fixed identifier highlighting in `Set` expressions
- Fixed highlighting of `>=` operator
- Fixed highlighting of the last colon in multi-argument expressions: i.e. `{expression:arg:arg}` and `~expression:arg:arg`

## 0.10.1

- Updated database syntax highlighting
- Fixed typo in message when database args are marked `{raw}`
- Fixed indentation rules (e.g. behaviour of the _Reindent Lines_ command)

## 0.10.0

- Added support for Star Rod 0.3.0-beta0
    - Unlike with Star Rod 0.2.0, the database used for function signature documentation is actually provided by the files in your Star Rod `database` folder.
- Added an _Open Database..._ command which lets you quickly view the database files Star Rod is using. Syntax highlighting has been added for these files also.
- Syntax highlighting for `mod.cfg`, `main.cfg`, `GameFlags.txt`, and `GameBytes.txt`.
- Better syntax highlighting for `*.enum` files.
- Many syntax highlighting fixes.

## 0.9.1

- Fixed an issue with _Compile Mod_ where compilation would be aborted if the output from Star Rod was greater than 1 MB. The new limit is 4 MB - please tell me if your mod hits this limit (you'll get an `stdout maxBuffer length exceeded` error) and I can raise it.

## 0.9.0

- Added _Run Mod_, a command that runs the compiled mod in an emulator. You may need to set `starRod.emulatorPath` in your preferences.

## 0.8.0

- Added _Compile Mod_ and _Compile Map..._ commands. Use `Ctrl+P` and type 'Star Rod' to use them.
- Added an option to disable showing script keyword documentation when they are hovered over.
- Added a prompt to set the Star Rod installation directory if it is unset or invalid.
- Fixed syntax highlighting for `#new:Script_Main`, `#new:Function_Init`, `#new:Script:Global`, etc.

## 0.7.0

- Huge improvements to the accuracy and completeness of syntax highlighting
    - Many scopes (what things are marked as) have changed, which means the colors you see due to your theme may have changed
    - :rocket: A custom color scheme will be coming in the next release to take advantage of the greater accuracy of the new scopes. For example, assembly instructions/registers will be highlighted differently depending on their group
- Typing at the start of a line no longer suggests script commands if you are not in a script

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

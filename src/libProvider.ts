import {
    languages,
    Hover,
    Range,
    MarkdownString,
    SnippetString,
    TextLine,
    TextDocument,
    Position,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    CompletionItem,
    FoldingRange,
    FoldingRangeKind,
} from 'vscode'
import * as vscode from 'vscode'

import * as LIB from './lib.json'
import loadDatabase, { Entry, Arg, Database, Usage } from './database'
import fixWs from 'fix-whitespace'
import Mod from './Mod'
import Script from './Script'
import { getStarRodDir, getStarRodDirVersion } from './extension'

import { StringDecoder } from 'string_decoder'
const deUtf8 = new StringDecoder('utf8')

const SCRIPT_OPS = new Map([
    ['End', {
        opcode: 0x01,
        snippet: new SnippetString('End'),
        documentation: fixWs`
        \`\`\`
        End
        \`\`\`

        ---

        Indicates the end of the script for parsing purposes. Required for all scripts for the interpreter to correctly parse them.
        `
    }],
    ['Return', {
        opcode: 0x02,
        snippet: new SnippetString('Return'),
        documentation: fixWs`
        \`\`\`
        Return
        \`\`\`

        ---

        Finish script execution and destroy it. If the script has a parent (\`script[68] != null\`), copy script flags and variables to its parent.
        `
    }],
    ['Label', {
        opcode: 0x03,
        snippet: new SnippetString('Label ${1:id}'),
        documentation: fixWs`
        \`\`\`
        Label id
        \`\`\`

        ---

        Up to 16 labels can be created per script for low-level flow control. The ID should be a unique value from 00-FF. Alternatively, you can supply a label name and a unique label ID will be automatically generated.
        `
    }],
    ['Goto', {
        opcode: 0x04,
        snippet: new SnippetString('Goto ${1:id}'),
        documentation: fixWs`
        \`\`\`
        Goto id
        \`\`\`

        ---

        Unconditionally jump to another position in the script. The ID field should either match the ID of a label, or match the name of a label.
        `
    }],
    ['Loop', {
        opcode: 0x05,
        snippet: new SnippetString('Loop ${1:count}\n$0'),
        documentation: fixWs`
            Loop count

        ---

        Repeat the following commands a certain number of times. To create an infinite loop, use count = 0. Star Rod assumes the iteration count is zero if no argument is provided.

        Note: passing a variable such as \`*Var[0]\` will decrement the variable _after_ each iteration until it equals zero. **If the variable is zero before the loop begins, the loop will be infinite.**
        `
    }],
    ['EndLoop', {
        opcode: 0x06,
        snippet: new SnippetString('EndLoop'),
        documentation: fixWs`
            EndLoop

        ---

        Designates the end of a loop body.
        `
    }],
    ['BreakLoop', {
        opcode: 0x07,
        snippet: new SnippetString('BreakLoop'),
        documentation: fixWs`
            BreakLoop

        ---

        Immediately jump out of a loop and continue execution after the next EndLoop command.
        `
    }],
    ['Wait', {
        opcode: 0x08,
        snippet: new SnippetString('Wait ${1:frames}'),
        documentation: fixWs`
            Wait frames

        ---

        Pauses the script for a certain number of frames (at 30 FPS). Affected by the script's timescale.
        `
    }],
    ['WaitSeconds', {
        opcode: 0x09,
        snippet: new SnippetString('WaitSeconds ${1:seconds}'),
        documentation: fixWs`
            WaitSeconds seconds

        ---

        Pauses the script for a certain number of seconds. Affected by the script's timescale.
        `
    }],
    ['If', {
        // opcodes 0x0A-11
        // TODO: check syntax for the bitwise AND conditions
        snippet: new SnippetString('If $1 ${2|==,!=,<,>,>=,<=|} $3'),
        documentation: fixWs`
            If A == B
            If A != B
            If A <  B
            If A  > B
            If A <= B
            If A >= B
            If ((A & B) != 0)
            If ((A & B) == 0)

        ---

        Conditional statements behave exactly as you might expect. Note that the bitwise AND conditions treat the second argument as a constant. This means that they will not try to dereference script variables so you should NOT supply them with \`*Var[X]\`, etc. They are intended to check whether certain flags are set for the first argument.
        `
    }],
    ['Else', {
        opcode: 0x12,
        snippet: new SnippetString('Else'),
        documentation: fixWs`
            Else

        ---

        Begins the block to be executed if the above If condition is false.
        `
    }],
    ['EndIf', {
        opcode: 0x13,
        snippet: new SnippetString('EndIf'),
        documentation: fixWs`
            EndIf

        ---

        Designates the end of an If..EndIf or If..Else..EndIf body.
        `
    }],
    ['Switch', {
        opcode: 0x14,
        snippet: new SnippetString('Switch ${1:value}'),
        documentation: fixWs`
            Switch value

        ---

        Begins a switch statement using the given value.
        `
    }],
    ['SwitchConst', {
        opcode: 0x15,
        snippet: new SnippetString('SwitchConst ${1:value}'),
        documentation: fixWs`
            SwitchConst value

        ---

        Switch using a constant, such as a set of flags. Instead of \`Switch *Var[X]\`, write \`Switch 20\` to do all comparisons against 20. Then, each case condition can use a variable, inverting the typical switch structure.
        `
    }],
    ['Case', {
        // opcodes 0x16-1B, 1F, 21
        // TODO: is `Case A to B` inclusive?
        snippet: new SnippetString('Case ${1|==,!=,<,>,>=,<=,&|} $2'), // TODO: 'to'
        documentation: fixWs`
            Case == B
            Case != B
            Case <  B
            Case  > B
            Case <= B
            Case >= B
            Case &  B
            Case A to B

        ---

        Begins the block to be executed if the condition is true. Unlike the switch you might be used to, **these cases do not support fallthrough**. i.e.

            Switch *Var[0]
                Case == 0
                Case == 1
                    % This code will *only* get executed when *Var[0] = 1, not 0
            EndSwitch

        To specify fallthrough behaviour, use \`CaseOR == B\`.
        `
    }],
    ['Default', {
        opcode: 0x1C,
        snippet: new SnippetString('Default'),
        documentation: fixWs`
            Default

        ---

        Begins the block to be executed if no preceding conditions matched.
        `
    }],
    ['CaseOR', {
        opcode: 0x1D,
        snippet: new SnippetString('CaseOR == $1'),
        documentation: fixWs`
            CaseOR == B

        ---

        Several of these cases may appear in series. The clause is executed if any values are equal. These cases support fall-though, so every subsequent clause will be executed until a normal case or \`EndCaseGroup\` is encountered.

        The normal (intended) use-case for \`CaseOR\` is:

            Switch *Var[0]
                Case == 00000001
                CaseOR ==00000002
                CaseOR == 00000004
                CaseOR == 00000006
                    % Do something...
                EndCaseGroup
            EndSwitch

        Remember that \`CaseOR\` clauses will also executes if the previous case was a match. Consider the following example:

            CaseOR == 10
                Call X
            CaseOR == 11
                Call Y
            CaseOR == 12
                Call Z

        Switching 10 will call X, Y, and Z but switching 11 will only call Y and Z.
        `
    }],
    ['CaseAND', {
        opcode: 0x1E,
        snippet: new SnippetString('CaseAND == $1'),
        documentation: fixWs`
            CaseAND == B

        ---

        Several of these cases may appear in series. All conditions must be satisfied for the clause to executed. May be unused, intended use-case unknown. Potentially useful for \`SwitchConst\` blocks to check multiple variables against the constant.
        `
    }],
    ['EndCaseGroup', {
        opcode: 0x20,
        snippet: new SnippetString('EndCaseGroup'),
        documentation: fixWs`
            EndCaseGroup

        ---

        Terminates a \`CaseOR\` or \`CaseAND\` fall-though/matching group.
        `
    }],
    ['BreakCase', {
        opcode: 0x22,
        snippet: new SnippetString('BreakCase'),
        documentation: fixWs`
            BreakCase

        ---

        Jumps out of a case clause to the end of the switch block.
        `
    }],
    ['EndSwitch', {
        opcode: 0x23,
        snippet: new SnippetString('EndSwitch'),
        documentation: fixWs`
            EndSwitch

        ---

        Ends a switch statement.
        `
    }],
    ['Set', {
        opcode: 0x24,
        snippet: new SnippetString('Set ${1:variable} ${2:value}'),
        documentation: fixWs`
            Set A B

        ---

        Sets a variable to the value of B.

        If B is also variable, this copies the **value** of B into A. Use \`SetConst\` to copy the reference instead.

        You can also use an arbitrary expression in the place of B using \`=\`. For example:

            Set *Var[0] = (*Var[2] + *Var[7]) / 20
        `
    }],
    ['SetConst', {
        opcode: 0x25,
        snippet: new SnippetString('SetConst ${1:variable} ${2:value}'),
        documentation: fixWs`
            SetConst A B

        ---

        Sets a variable to B.

        If B is also variable, this copies the **reference** of B into A. Effectively, this treats B as a "compile-time" constant. You can then use \`Call SetValueByRef\` and \`Call GetValueByRef\` to set the value referenced.

        When used with a non-variable B, \`SetConst\` acts identically to \`Set\`.
        `
    }],
    ['SetF', {
        opcode: 0x26,
        snippet: new SnippetString('SetF ${1:variable} ${2:value}'),
        documentation: fixWs`
            SetF A B

        ---

        Sets a variable to B, treating B as a float.
        `
    }],
    ['Add', {
        opcode: 0x27,
        snippet: new SnippetString('Add ${1:variable} ${2:addend}'),
        documentation: fixWs`
            Add A B

        ---

        Increments A by B, i.e. \`A = A + B\`.
        `
    }],
    ['Sub', {
        opcode: 0x28,
        snippet: new SnippetString('Sub ${1:variable} ${2:minuend}'),
        documentation: fixWs`
            Sub A B

        ---

        Decrements A by B, i.e. \`A = A - B\`.
        `
    }],
    ['Mul', {
        opcode: 0x29,
        snippet: new SnippetString('Mul ${1:variable} ${2:multiplier}'),
        documentation: fixWs`
            Mul A B

        ---

        Multiplies A by B, i.e. \`A = A * B\`.
        `
    }],
    ['Div', {
        opcode: 0x2A,
        snippet: new SnippetString('Div ${1:variable} ${2:divisor}'),
        documentation: fixWs`
            Div A B

        ---

        Divides A by B, i.e. \`A = A / B\`. The result is rounded down to the nearest integer.
        `
    }],
    ['Mod', {
        opcode: 0x2B,
        snippet: new SnippetString('Mod ${1:variable} ${2:divisor}'),
        documentation: fixWs`
            Mod A B

        ---

        Divides A by B and sets A to the remainder; i.e. \`A = A % B\`.
        `
    }],
    ['AddF', {
        opcode: 0x2C,
        snippet: new SnippetString('AddF ${1:variable} ${2:addend}'),
        documentation: fixWs`
            AddF A B

        ---

        Increments A by B, i.e. \`A = A + B\`.
        `
    }],
    ['SubF', {
        opcode: 0x2D,
        snippet: new SnippetString('SubF ${1:variable} ${2:minuend}'),
        documentation: fixWs`
            SubF A B

        ---

        Decrements A by B, i.e. \`A = A - B\`.
        `
    }],
    ['MulF', {
        opcode: 0x2E,
        snippet: new SnippetString('MulF ${1:variable} ${2:multiplier}'),
        documentation: fixWs`
            MulF A B

        ---

        Multiplies A by B, i.e. \`A = A * B\`.
        `
    }],
    ['DivF', {
        opcode: 0x2F,
        snippet: new SnippetString('DivF ${1:variable} ${2:divisor}'),
        documentation: fixWs`
            DivF A B

        ---

        Divides A by B, i.e. \`A = A / B\`.
        `
    }],
    ['UseIntBuffer', {
        opcode: 0x30,
        snippet: new SnippetString('UseIntBuffer ${1:$IntTable}'),
        documentation: fixWs`
            UseIntBuffer ptr

        ---

        Sets the buffer pointer (\`script[138]\`) to be used in \`Get1Int\` and similar commands.
        `
    }],
    ['Get1Int', {
        opcode: 0x31,
        snippet: new SnippetString('Get1Int $1'),
        documentation: fixWs`
            Get1Int var

        ---

        Shifts a value out the current buffer, advancing past it.

            #new:IntTable $IntTable { 01 02 03 }

            #new:Script $Script_Example {
                UseIntBuffer $IntTable
                Get1Int *Var[0]
                Get1Int *Var[1]
                Get1Int *Var[2]
                % *Var[0] = 01
                % *Var[1] = 02
                % *Var[2] = 03
                Return
                End
            }
        `
    }],
    ['Get2Int', {
        opcode: 0x32,
        snippet: new SnippetString('Get2Int $1 $2'),
        documentation: fixWs`
            Get2Int A B

        ---

        Shifts two values out the current buffer, advancing past them.
        `
    }],
    ['Get3Int', {
        opcode: 0x33,
        snippet: new SnippetString('Get3Int $1 $2 $3'),
        documentation: fixWs`
            Get3Int A B C

        ---

        Shifts three values out the current buffer, advancing past them.
        `
    }],
    ['Get4Int', {
        opcode: 0x34,
        snippet: new SnippetString('Get4Int $1 $2 $3 $4'),
        documentation: fixWs`
            Get4Int A B C D

        ---

        Shifts four values out the current buffer, advancing past them.
        `
    }],
    ['GetIntN', {
        opcode: 0x35,
        snippet: new SnippetString('GetIntN ${1:variable} ${2:index}'),
        documentation: fixWs`
            GetIntN var index

        ---

        Sets \`var\` to the Nth value in the current buffer. Does not advance past it.
        `
    }],
    ['UseFloatBuffer', {
        opcode: 0x36,
        snippet: new SnippetString('UseFloatBuffer ${1:$FloatTable}'),
        documentation: fixWs`
            UseFloatBuffer ptr

        ---

        Sets the buffer pointer (\`script[138]\`) to be used in \`Get1Float\` and similar commands.
        This is actually identical to \`UseIntBuffer\`.
        `
    }],
    ['Get1Float', {
        opcode: 0x37,
        snippet: new SnippetString('Get1Float $1'),
        documentation: fixWs`
            Get1Float var

        ---

        Shifts a value out the current buffer, advancing past it.
        `
    }],
    ['Get2Float', {
        opcode: 0x38,
        snippet: new SnippetString('Get2Float $1 $2'),
        documentation: fixWs`
            Get2Float A B

        ---

        Shifts two values out the current buffer, advancing past them.
        `
    }],
    ['Get3Float', {
        opcode: 0x39,
        snippet: new SnippetString('Get3Float $1 $2 $3'),
        documentation: fixWs`
            Get3Float A B C

        ---

        Shifts three values out the current buffer, advancing past them.
        `
    }],
    ['Get4Float', {
        opcode: 0x3A,
        snippet: new SnippetString('Get4Float $1 $2 $3 $4'),
        documentation: fixWs`
            Get4Float A B C D

        ---

        Shifts four values out the current buffer, advancing past them.
        `
    }],
    ['GetFloatN', {
        opcode: 0x3B,
        snippet: new SnippetString('GetFloatN ${1:variable} ${2:index}'),
        documentation: fixWs`
            GetFloatN var index

        ---

        Sets \`var\` to the Nth value in the current buffer. Does not advance past it.
        `
    }],
    ['UseArray', {
        opcode: 0x3C,
        snippet: new SnippetString('UseArray $1'),
        documentation: fixWs`
            UseArray ptr

        ---

        Sets the current array pointer (\`script[13C]\`). These values are accessed with \`*Array[X]\`, and can be read from and written to like any other variable (e.g. \`Set\`).
        `
    }],
    ['UseFlags', {
        opcode: 0x3D,
        snippet: new SnippetString('UseFlags $1'),
        documentation: fixWs`
            UseFlags ptr

        ---

        Sets the current flag array pointer (\`script[140]\`). These values are accessed with \`*FlagArray[X]\`, and can be read from and written to like any other variable (e.g. \`Set\`).
        `
    }],
    ['NewArray', {
        opcode: 0x3E,
        snippet: new SnippetString('NewArray ${1:size (words)} ${2:variable (set to $Array)}'),
        documentation: fixWs`
            NewArray size variable

        ---

        Allocates an array of the given size in words in the map linked list, and points \`variable\` to it. The array will not be deallocated until a new map is loaded.

            NewArray 5 *Var[0]
            UseArray *Var[0]
            Set *Array[0] 10
            % ...
        `
    }],
    ['AND', {
        opcode: 0x3F,
        snippet: new SnippetString('AND ${1:variable} $2'),
        documentation: fixWs`
            AND A B

        ---

        Performs a bitwise AND of A and B and sets A to the result, i.e. \`A = A & B\`.
        `
    }],
    ['ConstAND', {
        opcode: 0x40,
        snippet: new SnippetString('ConstAND ${1:variable} $2'),
        documentation: fixWs`
            ConstAND A B

        ---

        Performs a bitwise AND of A and B and sets A to the result, i.e. \`A = A & B\`. B is treated as a constant, so \`*Var[X]\` will be not be dereferenced.
        `
    }],
    ['OR', {
        opcode: 0x41,
        snippet: new SnippetString('OR ${1:variable} $2'),
        documentation: fixWs`
            OR A B

        ---

        Performs a bitwise OR of A and B and sets A to the result, i.e. \`A = A | B\`.
        `
    }],
    ['ConstOR', {
        opcode: 0x42,
        snippet: new SnippetString('ConstOR ${1:variable} $2'),
        documentation: fixWs`
            ConstOR A B

        ---

        Performs a bitwise OR of A and B and sets A to the result, i.e. \`A = A | B\`. B is treated as a constant, so \`*Var[X]\` will be not be dereferenced.
        `
    }],
    ['Call', {
        opcode: 0x43,
        snippet: new SnippetString('Call ${1:function}'),
        documentation: fixWs`
            Call function ( arg1 arg2 arg3 ... )

        ---

        Calls a function with the provided arguments. The parentheses are optional.

        This command will block until the function, recalled each frame, returns 2.
        `
    }],
    ['Exec', {
        // opcodes 0x44 and 0x45
        snippet: new SnippetString('Exec ${1:script} ${2:variable (optional; set to script ID)}'),
        documentation: fixWs`
            Exec script
            Exec script id

        ---

        Launches a new script, starting at the specified location. This location does not need to be at the beginning of the script.

        The new script does not block its parent (it'll run in the background, i.e. in a new thread), and will continue executing even if the parent terminates.

        If a variable \`id\` is provided, it can be later passed to commands like \`Kill\`, \`Suspend\`, or \`DoesScriptExist\` in order to control the new script's execution.

        The new script starts execution the following frame that this is called, not immediately.
        `
    }],
    ['ExecWait', {
        opcode: 0x46,
        snippet: new SnippetString('ExecWait ${1:script}'),
        documentation: fixWs`
            ExecWait script

        ---

        Launches a new script **and waits for it to return** before continuing.

        Vars and Flags are shared with the child script in order to fallitate return values of-sorts. If you don't like this behaviour but still want to wait for a child script to finish before continuing, use something like:

            Exec $Script_Child *Var[0]
            Loop
                DoesScriptExist *Var[0] *Var[1]
                If *Var[1] == .True
                    BreakLoop
                EndIf
                Wait 1
            EndLoop
            % Once here is reached, $Script_Child will have returned.

        The new script starts execution the following frame that this is called, not immediately. You might want to use \`Jump\` or inline the script in order to avoid this one frame of latency that might be noticable in some scenarios.
        `
    }],
    ['Bind', {
        // TODO
        opcode: 0x47,
        snippet: new SnippetString('Bind ${1:script} .Trigger:${2|FloorTouch,FloorAbove,FloorJump,WallTouch,WallPush,WallPressA,WallHammer,CeilingTouch,GameFlagSet,AreaFlagSet,PointBomb|} ${3:target} 1 ${5:variable or 0}'),
        documentation: fixWs`
            Bind script trigger target 1 outTrigger

        ---

        A fairly complicated command used to bind events to scripts. These events can originate from player actions, collisions, or changes in area/game flags.

        Triggers will not re-activate until the associated script returns.

        Triggers and their parameters:
        - \`.Trigger:FloorTouch {Collider:X}\` activates when the player stands on the collider
        - \`.Trigger:FloorAbove {Collider:X}\` activates when the player is above the collider
        - \`.Trigger:FloorJump {Collider:X}\` activates when the player jumps whilst standing on the collider
        - \`.Trigger:WallTouch {Collider:X}\` activates when the player touches the wall(s) of the collider
        - \`.Trigger:WallPush {Collider:X}\` activates when the player pushes against the wall(s) of the collider, e.g. for horizontal pipes
        - \`.Trigger:WallPressA {Collider:X}\` shows an "!" when the player touches the wall(s) of the collider and activates when they press A
        - \`.Trigger:WallHammer {Collider:X}\` activates when the player hammers the wall(s) of the collider
        - \`.Trigger:CeilingTouch {Collider:X}\` activates when the player hits their head on the ceiling(s) of the collider
        - \`.Trigger:GameFlagSet *GameFlag[XXX]\` activates when the given GameFlag is mutated
        - \`.Trigger:AreaFlagSet *AreaFlag[XXX]\` activates when the given AreaFlag is mutated
        - \`.Trigger:PointBomb $TriggerCoord\` activates when Bombette blows up within a certain radius of the given coordinate

        You can also supply entity IDs rather than collider IDs through a special format: \`40XX\`, where XX is the entity ID. IDs are given by the order in which entities were created (via \`Call MakeEntity\`). This is commonly used with WallPressA to bind Padlock entities to their scripts.
        `
    }],
    ['Unbind', {
        opcode: 0x48,
        snippet: new SnippetString('Unbind'),
        documentation: fixWs`
            Unbind

        ---

        Used in trigger scripts to unbind themselves, removing the trigger. This allows for the creation of one-time trigger events.
        `
    }],
    ['Kill', {
        opcode: 0x49,
        snippet: new SnippetString('Kill ${1:script ID}'),
        documentation: fixWs`
            Kill scriptID

        ---

        Terminates the script with the given ID, and any ChildThreads.
        `
    }],
    ['Jump', {
        opcode: 0x4A,
        snippet: new SnippetString('Jump ${1:script}'),
        documentation: fixWs`
            Jump script

        ---

        A rare command which changes the 'program counter' of the current script to begin executing
        somewhere else. This command will also clear any labels before jumping and identify new labels that occur between the new starting location and end of the script.

        \`Jump X\` is effectively the same as the following, but does not incur a frame of latency.

            ExecWait X
            Return
            End
        `
    }],
    ['SetPriority', {
        opcode: 0x4B,
        snippet: new SnippetString('SetPriority ${1:priority (00-FF, higher executed later)}'),
        documentation: fixWs`
            SetPriority priority

        ---

        Sets the execution priority of this script (00-FF). Scripts with a higher priority are executed later than those with lower values.
        `
    }],
    ['SetTimescale', {
        opcode: 0x4C,
        snippet: new SnippetString('SetTimeScale *Fixed[$1]'),
        documentation: fixWs`
            SetTimescale scale

        ---

        Changes the rate time flows for this script. This affects \`Wait\` and \`WaitSeconds\`.

            SetTimeScale *Fixed[2.0]
            WaitSeconds 2               % Waits for 1 second rather than two
        `
    }],
    ['SetGroup', {
        opcode: 0x4D,
        snippet: new SnippetString('SetGroup $1'),
        documentation: fixWs`
            SetGroup group

        ---

        Assigns the given group number to the current scripts. All scripts within a group can be suspended and resumed together (see \`SuspendAll\` etc).

        Group 1B is used for exit scripts from maps.
        `
    }],
    ['BindLock', {
        opcode: 0x4E,
        snippet: new SnippetString('BindLock ${1:script} .Trigger:${2|FloorTouch,FloorAbove,FloorJump,WallTouch,WallPush,WallPressA,WallHammer,CeilingTouch,GameFlagSet,AreaFlagSet,PointBomb|} $3 ${4:itemList} 0 1'),
        documentation: fixWs`
            BindLock script trigger colliderID itemList 0 1

        ---

        Binds a script to an event contingent upon an item request prompt (e.g. a locked door prompting the player for a key).
        `
    }],
    ['SuspendAll', {
        opcode: 0x4F,
        snippet: new SnippetString('SuspendAll $1'),
        documentation: fixWs`
            SuspendAll group

        ---

        Pauses all scripts in the given group.
        `
    }],
    ['ResumeAll', {
        opcode: 0x50,
        snippet: new SnippetString('ResumeAll $1'),
        documentation: fixWs`
            ResumeAll group

        ---

        Resumes all scripts in the given group.
        `
    }],
    ['SuspendOthers', {
        opcode: 0x51,
        snippet: new SnippetString('SuspendOthers $1'),
        documentation: fixWs`
        SuspendOthers group

        ---

        Pauses all scripts in the given group **except for the current script**.
        `
    }],
    ['ResumeOthers', {
        opcode: 0x52,
        snippet: new SnippetString('ResumeOthers $1'),
        documentation: fixWs`
            ResumeOthers group

        ---

        Resumes all scripts in the given group **except for the current script**.
        `
    }],
    ['Suspend', {
        opcode: 0x53,
        snippet: new SnippetString('Suspend ${1:script ID}'),
        documentation: fixWs`
            Suspend scriptID

        ---

        Pauses a particular script.
        `
    }],
    ['Resume', {
        opcode: 0x54,
        snippet: new SnippetString('Resume ${1:script ID}'),
        documentation: fixWs`
            Resume scriptID

        ---

        Resumes a particular script.
        `
    }],
    ['DoesScriptExist', {
        opcode: 0x55,
        snippet: new SnippetString('DoesScriptExist ${1:script ID} ${2:variable (out boolean)}'),
        documentation: fixWs`
            DoesScriptExist scriptID variable

        ---

        Sets \`variable\` to \`.True\` if the given script is still running, \`.False\` otherwise.
        `
    }],
    ['Thread', {
        opcode: 0x56,
        snippet: new SnippetString('Thread'),
        documentation: fixWs`
            Thread

        ---

        Begins a temporary helper block that executes some tasks in parallel with the main thread, similar to \`Exec\` but inline. Vars and flags are copied to the thread but are not copied back after the thread finishes. The thread can also outlive its parent.
        `
    }],
    ['EndThread', {
        opcode: 0x57,
        snippet: new SnippetString('EndThread'),
        documentation: fixWs`
            EndThread

        ---

        Designates the end of a \`Thread\` block.
        `
    }],
    ['ChildThread', {
        opcode: 0x58,
        snippet: new SnippetString('ChildThread'),
        documentation: fixWs`
            ChildThread

        ---

        Similar to \`Thread\`, but the child thread **shares variables and flags** with the parent and will be terminated if the parent script ends.
        `
    }],
    ['EndChildThread', {
        opcode: 0x59,
        snippet: new SnippetString('EndChildThread'),
        documentation: fixWs`
            EndChildThread

        ---

        Designates the end of a \`ChildThread\` block.
        `
    }],
    ['PrintVar', {
        // Unknown opcode!
        snippet: new SnippetString('PrintVar $1'),
        documentation: fixWs`
            PrintVar var

        ---

        Prints a script variable name and its decimal value to \`802DACA0\` according to the original naming convention used by the developers, e.g. \`*GameByte[X]\` is printed as \`GSW(X)\`.

        If you turn on _Enable Debug Information_ in the build options and press DPad-Right during gameplay, printed variables will be shown onscreen along with a bunch of other information.
        `
    }]
])

interface Token {
    source: string,
    range: Range,
}

const OPERATORS = '+-*/%()'.split('')

function tokenizeLine(line: TextLine): Token[] {
    const tokens = []

    let buffer = '', startIndex = 0
    let inString = false, escaped = false, inComment = false, inExpression = false
    for (var i = 0; i < line.text.length; i++) {
        const ch = line.text[i]

        if (inString) {
            if (escaped) {
                escaped = false
            } else if (ch == '\\') {
                escaped = true
            } else if (ch == '"') {
                inString = false
            }
        } else if (inComment) {
            if (ch == '%' && line.text[i + 1] == '/') {
                i++
                inComment = false
            }
            continue
        } else if (inExpression) {
            if (ch == '}') {
                inExpression = false
            }
        } else {
            if (ch == '"') {
                inString = true
            } else if (ch == '/' && line.text[i + 1] == '%') {
                i++
                inComment = true
                continue
            } else if (ch == '%') {
                inComment = true
                break
            } else if (ch == '{') {
                inExpression = true
            } else if (ch == ' ' || ch == '\t') {
                // Horizontal whitespace is end of token
                buffer = buffer.trim()
                if (buffer.length) {
                    tokens.push({
                        source: buffer,
                        range: new Range(
                            line.lineNumber,
                            startIndex,
                            line.lineNumber,
                            i,
                        ),
                    })
                }

                buffer = ''
                startIndex = i + 1
                continue
            } else if (OPERATORS.includes(ch)) {
                // Operators are singular tokens AND delimit

                // Push previous token
                buffer = buffer.trim()
                if (buffer.length) {
                    tokens.push({
                        source: buffer,
                        range: new Range(
                            line.lineNumber,
                            startIndex,
                            line.lineNumber,
                            i,
                        ),
                    })
                }

                // Push operator token
                tokens.push({
                    source: ch,
                    range: new Range(
                        line.lineNumber,
                        i,
                        line.lineNumber,
                        i + 1,
                    ),
                })

                buffer = ''
                startIndex = i + 1
                continue
            }
        }

        buffer += ch
    }

    if (!inComment && buffer.trim().length) {
        tokens.push({
            source: buffer.trim(),
            range: new Range(
                line.lineNumber,
                startIndex,
                line.lineNumber,
                i,
            ),
        })
    }

    return tokens
}

function parseFileExtension(fileName: string): { isPatch: boolean, isGlobalPatch: boolean, sourceType: string } {
    const fileExt = fileName.split('.').pop() || 'wscr'
    return {
        sourceType: fileExt[0] || 'w', // m, b, w, p
        isPatch: fileExt.endsWith('pat') || fileExt === 'patch',
        isGlobalPatch: fileExt === 'patch',
    }
}

function getStructTypeAt(document: TextDocument, startPos: Position): string {
    // Traverse up in lines until we see the head of this struct (#new:X, @X, etc).
    let pos = startPos.translate()
    while (true) {
        const line = document.lineAt(pos)

        const tokens = tokenizeLine(line)
        if (tokens.length) {
            // If this is the head line, return its type.
            if (tokens[0].source.startsWith('#new')) {
                const [ hashNew, type, ...rest ] = tokens[0].source.split(':')
                return type
            } else if (tokens[0].source.startsWith('#string')) {
                return 'String'
            } else if (tokens[0].source == '@Function' || tokens[0].source == '@Hook') {
                return 'Function'
            } else if (tokens[0].source == '@Data') {
                return 'Data'
            } else if (tokens[0].source.startsWith('@Script')) {
                return 'Script'
            } else if (tokens[0].source == '@') {
                // It's a generic patch! Figure out the type of struct this is from its usage.
                const firstLineTokens = tokenizeLine(document.lineAt(pos.translate(1)))

                const hasOffset = tokens.length && /^[A-Za-z0-9]+:$/.test(tokens[0].source)
                const offsetToken = hasOffset ? tokens.shift() : null

                if (Array.from(SCRIPT_OPS.keys()).includes(tokens[0].source)) {
                    return 'Script'
                } else if (['ADDIU', 'PUSH'].includes(tokens[0].source)) { // TODO: more instructions
                    return 'Function'
                } else {
                    // Unknown :(
                    const identifier = tokens[1].source

                    // TODO: parse structs above this one, including imports and mscr/bscrs, to
                    // determine the type of the identifier.
                    //
                    // For now, we'll guess via the name of the identifier, which usually takes
                    // the form "$TYPE_Name". This WILL give us false positives!
                    return identifier.substr(1).split('_')[0]
                }
            }
        }

        pos = pos.translate(-1) // Up one line.
    }
}

type Enum = {
    namespace: string
    libName: string
    members: string[]
}

export async function activate(ctx: vscode.ExtensionContext) {
    const mod = Mod.getActive()

    let syntaxVersion: number
    let lib: Database | undefined

    const srVersion = await getStarRodDirVersion()
    if (srVersion?.startsWith('0.2')) { // TODO: use semver
        lib = LIB as Database
        syntaxVersion = 0.2
    } else {
        syntaxVersion = 0.3
        const srDir = getStarRodDir()
        if (srDir) {
            lib = await loadDatabase(srDir)
        }
    }

    let enums: Array<Enum> = []
    const updateEnums = async () => {
        enums = []

        // Read all enum files.
        // Note that files in Star Rod's local `database` are not read, just those in `globals/enum/`.
        for (const uri of await vscode.workspace.findFiles('**/globals/enum/*.enum')) {
            const contents = await vscode.workspace.fs.readFile(uri)
            const lines = deUtf8.write(Buffer.from(contents)).split(/\r?\n/)

            const namespace = /^[^\s%]+/.exec(lines.shift() ?? '')?.[0]
            const libName = /^[^\s%]+/.exec(lines.shift() ?? '')?.[0]
            const reversed = /^[^\s%]+/.exec(lines.shift() ?? '')?.[0] === 'true'

            if (!namespace || !libName) continue

            const members = []
            for (const line of lines) {
                const re = reversed ? /^([^\s%]+)\s*=\s*[0-9a-fA-F]+/ : /^[0-9a-fA-F]+\s*=\s*([^\s%]+)/
                const member = re.exec(line)?.[1]
                if (member) members.push(member)
            }

            enums.push({
                namespace,
                libName,
                members,
            })
        }
    }
    updateEnums()
    const enumWatcher = vscode.workspace.createFileSystemWatcher('**/globals/enum/*.enum')
    enumWatcher.onDidChange(evt => updateEnums())
    enumWatcher.onDidCreate(evt => updateEnums())
    enumWatcher.onDidDelete(evt => updateEnums())
    ctx.subscriptions.push(enumWatcher)

    let flags: Array<string> = []
    const updateFlags = async () => {
        flags = []

        for (const uri of await vscode.workspace.findFiles('**/globals/*.txt')) {
            const contents = await vscode.workspace.fs.readFile(uri)
            const lines = deUtf8.write(Buffer.from(contents)).split(/\r?\n/)

            for (const line of lines) {
                const flag = /^[0-9a-fA-F]+\s*=\s*([^\s%]+)/.exec(line)?.[1]
                if (flag) flags.push(flag)
            }
        }
    }
    updateFlags()
    const flagWatcher = vscode.workspace.createFileSystemWatcher('**/globals/*.txt')
    flagWatcher.onDidChange(evt => updateFlags())
    flagWatcher.onDidCreate(evt => updateFlags())
    flagWatcher.onDidDelete(evt => updateFlags())
    ctx.subscriptions.push(flagWatcher)

    const getDatabaseForDoc = async (document: vscode.TextDocument): Promise<Entry[] | undefined> => {
        if (!lib) return undefined

        const { sourceType, isGlobalPatch } = parseFileExtension(document.fileName)
        const database: Entry[] = [...lib.common]

        if (sourceType === 'm' || sourceType === 'w' || isGlobalPatch) database.push(...lib.world)
        if (sourceType === 'b' || isGlobalPatch) database.push(...lib.battle)
        if (sourceType === 'p' || isGlobalPatch) database.push(...lib.pause)

        // Add locally-declared structs.
        // TODO: caching/memoization
        const seenScripts = new Set()
        const addStructsToDatabase = async (script: Script, namespace = '', requireExport = false) => {
            // Prevent infinite #import recursion.
            if (seenScripts.has(script.document.fileName)) return
            seenScripts.add(script.document.fileName)

            // Attempt to parse the script and add its structs to the database.
            try {
                let awaitingExport: Entry[] = []
                for (const directive of script.parseDirectives()) {
                    if (directive.keyword === '#new') {
                        const identifier = directive.atoms[0]

                        let usage: Usage = 'any'
                        if (directive.args[0].startsWith('Script')) usage = 'scr'
                        else if (directive.args[0].startsWith('Function')) {
                            // 'api' if identifier has uppercase characters.
                            usage = /[A-Z]/.test(identifier) ? 'api' : 'asm'
                        }

                        // TODO: parse type information in `directive.comment`

                        ;(requireExport ? awaitingExport : database).push({
                            usage,
                            structType: directive.args[0],
                            name: namespace ? identifier.replace('$', `$${namespace}:`) : identifier,
                            note: directive.comment,
                            attributes: {},
                        })
                    }

                    // Follow imports.
                    if (directive.keyword === '#import') {
                        const [ importPath, namespace ] = directive.atoms
                        const tld = script.directory()?.tld
                        if (tld) {
                            const uri = tld.with({ path: tld.path + '/import/' + importPath })
                            const document = await vscode.workspace.openTextDocument(uri)
                            await addStructsToDatabase(new Script(document), namespace)
                        }
                    }

                    if (directive.keyword === '#export') {
                        const identifier = directive.atoms[0]
                        awaitingExport = awaitingExport.filter(entry => {
                            if (entry.name === identifier) {
                                database.push(entry)
                                return false
                            } else {
                                return true
                            }
                        })
                    }
                }
            } catch (error) {
                console.error(error)
            }
        }

        const script = new Script(document)

        // For non-global-patch files, add exported global-patch entries.
        if (script.scope()) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(script.document.uri)
            if (workspaceFolder) {
                for (const uri of await vscode.workspace.findFiles(
                    new vscode.RelativePattern(workspaceFolder, 'globals/patch/**/*.patch')
                )) {
                    const document = await vscode.workspace.openTextDocument(uri)
                    await addStructsToDatabase(new Script(document), undefined, true)
                }
            }
        }

        // If this is a `patch` script, include local entries from the relevant src/gen script, if there is one.
        if (script.directory()?.subdir === 'patch') {
            // src takes precedence over gen.
            const src = await script.findRelevantScript('src')
            if (src) {
                await addStructsToDatabase(src)
            } else {
                const gen = await script.findRelevantScript('gen')
                if (gen) await addStructsToDatabase(gen)
            }
        }

        await addStructsToDatabase(script)

        return database
    }

    const getEntryByName = (db: Entry[], name: string) => {
        return db.find(d => d.name === name || d.ramAddress === name)
    }

    const documentEntry = (entry: Entry, forceWrap: boolean = false) => {
        const documentArg = (arg: Arg) => [
            arg.container,
            arg.attributes.out && (
                arg.attributes.outType ?
                    `{out ${arg.attributes.outType}}` :
                    '{out}'
                ),
            arg.type,
            arg.name,
            arg.note && `% ${arg.note}`,
            arg.attributes.raw && '% ⚠ Raw - only constants allowed',
            arg.attributes.ignore && `% ignored if equal to ${arg.attributes.ignore}`
        ].filter(Boolean).join(' ')

        let doc = '```starrodlib\n'

        //if (entry.note) doc += `% ${entry.note}\n`

        doc += [
            entry.usage === 'any' ? entry.structType : entry.usage,
            entry.name,
        ].filter(Boolean).join(' ')

        if (entry.args || entry.returns) {
            if (entry.args) {
                if (entry.args.length) {
                    const argDocs = entry.args.map(documentArg)
                    if (!forceWrap && entry.args.length < 4 && !entry.args.some(arg => arg.note)) {
                        doc += ' ( '
                        doc += argDocs.join(', ')
                        doc += ' )'
                    } else {
                        doc += ' (\n'
                        doc += argDocs
                            .map(s => '\t' + s)
                            .join('\n')
                        doc += '\n)'
                    }
                } else {
                    doc += ' ()'
                }
            } else {
                doc += ' ( ??? )'
            }

            if (entry.returns) {
                if (entry.returns.length) {
                    doc += ' ->'

                    const argDocs = entry.returns.map(documentArg)
                    if (!forceWrap && entry.returns.length < 4 && !entry.returns.some(arg => arg.note || Object.keys(arg.attributes).length)) {
                        doc += ' ( '
                        doc += argDocs.join(', ')
                        doc += ' )'
                    } else {
                        doc += ' (\n'
                        doc += argDocs
                            .map(s => '\t' + s)
                            .join('\n')
                        doc += '\n)'
                    }
                }
            } else {
                doc += ' -> ( ??? )'
            }
        }

        doc += '\n```\n'

        if (syntaxVersion >= 0.3) {

            if (entry.attributes.warning === 'unused') {
                doc += `⚠ Never used in vanilla but functions properly\n\n`
            } else if (entry.attributes.warning === 'internal') {
                doc += `⚠ Used by the core game engine, not intended for general use\n\n`
            } else if (entry.attributes.warning === 'bugged') {
                doc += `⚠ Buggy\n\n`
            } else if (entry.attributes.warning) {
                doc += `⚠ ${entry.attributes.warning}\n\n`
            }

            if (entry.note) doc += entry.note + '\n\n'

            if (entry.ramAddress) {
                doc += `RAM address: \`${entry.ramAddress}\`  \n`
            }

            if (entry.romAddress) {
                doc += `ROM offset: \`${entry.romAddress}\`  \n`
            }
        }

        return doc
    }

    const documentEntryOneLine = (entry: Entry) => {
        if (entry.args) {
            if (entry.args.length) {
                return `${entry.usage} ${entry.name} ( ${entry.args.map(arg => arg.name || arg.type).join(' ')} )`
            } else {
                return `${entry.usage} ${entry.name} ()`
            }
        } else {
            return `${entry.usage} ${entry.name} ( ??? )`
        }
    }

    ctx.subscriptions.push(languages.registerHoverProvider('starrod', {
        async provideHover(document, position, token) {
            const tokens = tokenizeLine(document.lineAt(position))
            const hoveredToken: Token | undefined = tokens.find(t => t.range.contains(position))
            if (!hoveredToken) return

            const hasOffset = tokens.length && /^[A-Za-z0-9]+:$/.test(tokens[0].source)
            const offsetToken = hasOffset ? tokens.shift() : null

            const opToken = tokens[0]

            const db = await getDatabaseForDoc(document)

            const handleExpression = (expression: string) => {
                const args = expression.split(':')

                if (args[0] === 'Func') {
                    const entry = db && getEntryByName(db, args[1])
                    if (entry) {
                        return new Hover(documentEntry(entry), tokens[1].range)
                    }
                }

                return undefined
            }

            if (hoveredToken === opToken) {
                const op = SCRIPT_OPS.get(opToken.source)

                if (op && vscode.workspace.getConfiguration().get('starRod.showHoverDocumentationForScriptKeywords', true))
                    return new Hover(op.documentation, opToken.range)
            } else if (['Call', 'Exec', 'ExecWait', 'Jump', 'Bind'].includes(opToken.source) && hoveredToken == tokens[1]) {
                const funcToken = tokens[1]
                const entry = db && getEntryByName(db, funcToken.source)
                if (entry) return new Hover(documentEntry(entry), funcToken.range)
            } else if (syntaxVersion === 0.2 && hoveredToken.source.startsWith('{') && hoveredToken.source.endsWith('}')) {
                return handleExpression(hoveredToken.source.substr(1, hoveredToken.source.length - 2))
            } else if (syntaxVersion === 0.3 && hoveredToken.source.startsWith('~')) {
                return handleExpression(hoveredToken.source.substr(1))
            } else if (hoveredToken.source.startsWith('$')) {
                const entry = db && getEntryByName(db, hoveredToken.source)
                if (entry) return new Hover(documentEntry(entry), hoveredToken.range)
            }

            return null
        },
    }))

    ctx.subscriptions.push(languages.registerSignatureHelpProvider('starrod', {
        async provideSignatureHelp(document, position, token, context) {
            const tokens = tokenizeLine(document.lineAt(position))
            let caretTokenIdx = 0
            for (const token of tokens) {
                if (position.character > token.range.end.character) {
                    caretTokenIdx++
                }
            }

            const hasOffset = tokens.length && /^[A-Za-z0-9]+:$/.test(tokens[0].source)
            const offsetToken = hasOffset ? tokens.shift() : null
            if (hasOffset) caretTokenIdx--

            const opToken = tokens[0]

            if (opToken.source === 'Call') {
                const funcToken = tokens[1]
                const db = await getDatabaseForDoc(document)
                const entry = db && getEntryByName(db, funcToken.source)

                if (entry) {
                    const signature = new SignatureInformation(documentEntryOneLine(entry))
                    signature.documentation = entry.note

                    if (entry.args) {
                        signature.parameters = entry.args.map(arg => (
                            new ParameterInformation(arg.name || arg.type, [
                                arg.type,
                                arg.container,
                                arg.note,
                            ].join('\n'))
                        ))
                    }

                    const help = new SignatureHelp()
                    help.activeParameter = tokens[2].source == '('
                        ? caretTokenIdx - 3
                        : caretTokenIdx - 2
                    help.activeSignature = 0
                    help.signatures = [signature]

                    return help
                }
            }

            return null
        }
    }, '(', ' '))

    ctx.subscriptions.push(languages.registerCompletionItemProvider('starrod', {
        async provideCompletionItems(document, position, token, context) {
            const commentChar = document.lineAt(position).text.indexOf('%')
            if (commentChar != -1 && commentChar <= position.character) {
                // Looks like we're in a comment - abort
                return null
            }

            const tokens = tokenizeLine(document.lineAt(position))
            let caretTokenIdx = 0
            for (const token of tokens) {
                if (position.character > token.range.end.character) {
                    caretTokenIdx++
                }
            }
            const structType = getStructTypeAt(document, position)

            // No autocompletion for strings (yet)
            if (structType === 'String') return null

            const db = await getDatabaseForDoc(document)

            const hasOffset = tokens.length && /^[A-Za-z0-9]+:$/.test(tokens[0].source)
            const offsetToken = hasOffset ? tokens.shift() : null
            if (hasOffset) caretTokenIdx--
            const caretToken = tokens[caretTokenIdx]

            if (caretToken.source.startsWith('.')) {
                if (caretToken.source.includes(':')) {
                    // List namespace members
                    const namespace = caretToken.source.split(':')[0].substr(1) // Drop leading period
                    return enums.find(en => en.namespace === namespace)
                        ?.members
                        ?.map(name => new CompletionItem(name, vscode.CompletionItemKind.EnumMember))
                } else {
                    // List namespaces
                    // TODO: if current arg is an enum, suggest that namespace only
                    // TODO: if structType.startsWith('Function'), suggest labels
                    const s = enums
                        .map(en => {
                            const item = new CompletionItem(en.namespace, vscode.CompletionItemKind.Enum)
                            item.insertText = new SnippetString(en.namespace + ':')
                            return item
                        })
                    s.push(new CompletionItem('True', vscode.CompletionItemKind.Constant))
                    s.push(new CompletionItem('False', vscode.CompletionItemKind.Constant))
                    return s
                }
            }

            if (caretToken.source.startsWith('*')) {
                // List mod/game flags, vars, etc
                const s = flags.map(flag => new CompletionItem(flag, vscode.CompletionItemKind.Constant))

                const genVarItem = (val: string) => {
                    const item = new CompletionItem(val, vscode.CompletionItemKind.Variable)
                    item.insertText = new SnippetString(val)
                    item.insertText.appendText('[')
                    item.insertText.appendPlaceholder('')
                    item.insertText.appendText(']')
                    return item
                }

                s.push(genVarItem('Var'), genVarItem('Flag'))
                s.push(genVarItem('MapVar'), genVarItem('MapFlag'))
                s.push(genVarItem('AreaByte'), genVarItem('AreaFlag'))

                return s
            }

            if (structType.startsWith('Script')) {
                const opToken = tokens[0]

                if (caretTokenIdx === 0) {
                    return Array.from(SCRIPT_OPS.entries()).map(([ name, o ]) => {
                        const item = new CompletionItem(name, 13)

                        item.insertText = o.snippet
                        item.documentation = new MarkdownString(o.documentation)

                        return item
                    })
                } else if (opToken.source === 'Call' && caretTokenIdx === 1) {
                    if (!db) return
                    return db
                        .filter(entry => entry.usage === 'api')
                        .map(entry => {
                            const item = new CompletionItem(entry.name, 2)

                            item.kind = vscode.CompletionItemKind.Function
                            item.documentation = new MarkdownString(documentEntry(entry, true))

                            item.insertText = new SnippetString()
                            item.insertText.appendText(entry.name)
                            item.insertText.appendText(' ')
                            if (!entry.args) {
                                item.insertText.appendText('( ')
                                item.insertText.appendPlaceholder('')
                                item.insertText.appendText(' )')
                            } else if (entry.args.length) {
                                item.insertText.appendText('( ')
                                for (const arg of entry.args) {
                                    item.insertText.appendPlaceholder((arg.name || arg.type).replace(/\s/g, ''))
                                    item.insertText.appendText(' ')
                                }
                                item.insertText.appendText(')')
                            } else {
                                item.insertText.appendText('()')
                            }

                            return item
                        })
                } else if (['Exec', 'ExecWait', 'Jump', 'Bind'].includes(opToken.source) && caretTokenIdx === 1) {
                    if (!db) return
                    return db
                        .filter(entry => entry.usage === 'scr')
                        .map(entry => {
                            const item = new CompletionItem(entry.name, 2)

                            item.kind = vscode.CompletionItemKind.Method
                            item.documentation = new MarkdownString(documentEntry(entry, true ))

                            item.insertText = new SnippetString()
                            item.insertText.appendText(entry.name)
                            return item
                        })
                }

                // TODO: contextual autocomplete based on Call type info
            }

            if (caretToken.source === '{Func:' || caretToken.source === '~Func:') {
                if (!db) return
                return db
                    .filter(entry => entry.usage === 'asm')
                    .map(entry => {
                        const item = new CompletionItem(entry.name, 2)

                        item.kind = vscode.CompletionItemKind.Class
                        item.documentation = new MarkdownString(documentEntry(entry, true ))

                        item.insertText = new SnippetString()
                        item.insertText.appendText(entry.name)
                        return item
                    })
            }

            if (caretToken.source.startsWith('$')) {
                if (!db) return
                return db
                    .filter(entry => entry.name.startsWith('$'))
                    .map(entry => {
                        const item = new CompletionItem(entry.name, 2)

                        item.kind = vscode.CompletionItemKind.Struct
                        if (entry.usage === 'scr') item.kind = vscode.CompletionItemKind.Method
                        if (entry.usage === 'api') item.kind = vscode.CompletionItemKind.Function
                        if (entry.usage === 'asm') item.kind = vscode.CompletionItemKind.Class
                        item.documentation = new MarkdownString(documentEntry(entry, true ))

                        item.insertText = new SnippetString()
                        item.insertText.appendText(entry.name)
                        return item
                    })
            }

            return null
        }
    }, ' ', '\t', ':', '.', '*', '$'))

    ctx.subscriptions.push(languages.registerFoldingRangeProvider('starrod', {
        async provideFoldingRanges(document, context, token) {
            const ranges: FoldingRange[] = []
            const regions: [string, number][] = []
            const lines = document.getText().split(/\r?\n/)

            for (let lineNo = 0; lineNo < lines.length; lineNo++) {
                const beginRegion = (r: string) => regions.push([r, lineNo])
                const endRegion = (r: string, lineOffset = 0, overriding = false): boolean => {
                    do {
                        const popped = regions.pop()
                        if (!popped) return false
                        const [ gotR, startLineNo ] = popped

                        if (gotR !== r && !overriding) {
                            regions.push(popped)
                            return false
                        }

                        const range = new FoldingRange(
                            startLineNo,
                            lineNo + lineOffset,
                        )
                        if (r === 'comment') range.kind = FoldingRangeKind.Comment
                        if (r === 'import') range.kind = FoldingRangeKind.Imports
                        if (r === 'export') range.kind = FoldingRangeKind.Imports
                        if (r === 'block') range.kind = FoldingRangeKind.Region
                        if (r === 'stringblock') range.kind = FoldingRangeKind.Region
                        ranges.push(range)

                        if (gotR === r) {
                            return true
                        }
                    } while (regions.length > 0)
                    return false
                }
                const peekRegion = (): string => regions[regions.length - 1][0]

                let line = lines[lineNo].trim()

                if (line.startsWith('/%')) {
                    beginRegion('comment')
                } else if (line.endsWith('%/')) {
                    endRegion('comment', 0, true)
                } else if (syntaxVersion === 0.2 && line === '') {
                    endRegion('block', -1, true)
                } else if (syntaxVersion > 0.2 && line === '}') {
                    endRegion('block', -1, true)
                }

                if (line.indexOf('%') > -1)
                    line = line.substring(0, line.indexOf('%')).trim() // Remove line comment

                if (/^#import(\s|$)/g.test(line)) {
                    if (regions.length === 0)
                        beginRegion('import')
                } else {
                    endRegion('import', -1)
                }

                if (/^#export(\s|$)/g.test(line)) {
                    if (regions.length === 0)
                        beginRegion('export')
                } else {
                    endRegion('export', -1)
                }

                if (/^#define(\s|$)/g.test(line)) {
                    if (regions.length === 0)
                        beginRegion('define')
                } else {
                    endRegion('define', -1)
                }

                if (/^(#new:[^ \t]+|@[^ \t]*)(\s|$)/g.test(line)) {
                    beginRegion('block')
                } else if (/^#string(:|\s|$)/g.test(line)) {
                    beginRegion('stringblock')
                } else if (/\[END\]/g.test(line)) {
                    endRegion('stringblock', 0, true)
                } else if (/^([0-9A-Za-z]+:\s+)?Loop(\s|$)/g.test(line)) {
                    beginRegion('loop')
                } else if (/^([0-9A-Za-z]+:\s+)?EndLoop(\s|$)/g.test(line)) {
                    endRegion('loop', -1)
                } else if (/^([0-9A-Za-z]+:\s+)?If(\s|$)/g.test(line)) {
                    beginRegion('if')
                } else if (/^([0-9A-Za-z]+:\s+)?Else(\s|$)/g.test(line)) {
                    endRegion('if', -1)
                    beginRegion('else')
                } else if (/^([0-9A-Za-z]+:\s+)?EndIf(\s|$)/g.test(line)) {
                    if (!endRegion('else', -1))
                        endRegion('if', -1)
                } else if (/^([0-9A-Za-z]+:\s+)?Thread(\s|$)/g.test(line)) {
                    beginRegion('thread')
                } else if (/^([0-9A-Za-z]+:\s+)?EndThread(\s|$)/g.test(line)) {
                    endRegion('thread', -1)
                } else if (/^([0-9A-Za-z]+:\s+)?ChildThread(\s|$)/g.test(line)) {
                    beginRegion('childthread')
                } else if (/^([0-9A-Za-z]+:\s+)?EndChildThread(\s|$)/g.test(line)) {
                    endRegion('childthread', -1)
                } else if (/^([0-9A-Za-z]+:\s+)?Switch(\s|$)/g.test(line)) {
                    beginRegion('switch')
                } else if (/^([0-9A-Za-z]+:\s+)?EndSwitch(\s|$)/g.test(line)) {
                    endRegion('case', -1)
                    endRegion('switch', -1, true)
                } else if (/^([0-9A-Za-z]+:\s+)?Case(OR|AND)(\s|$)/g.test(line)) {
                    if (peekRegion() !== 'casegroup')
                        beginRegion('casegroup')
                } else if (/^([0-9A-Za-z]+:\s+)?EndCaseGroup(\s|$)/g.test(line)) {
                    endRegion('casegroup', -1)
                } else if (/^([0-9A-Za-z]+:\s+)?(Case|Default)(\s|$)/g.test(line)) {
                    endRegion('case', -1)
                    beginRegion('case')
                } else if (/^([0-9A-Za-z]+:\s+)?Label(\s|$)/g.test(line)) {
                    endRegion('label', -1)
                    beginRegion('label')
                }
            }

            return ranges
        }
    }))
}

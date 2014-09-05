@@ Title=Shortcut to Modifying Your Last Terminal Command
@@ Date=2014-09-04 23:00

[ch]: http://furbo.org/2014/09/03/the-terminal/

Recently, Craig Hockenberry posted a very informative post about various tricks that could be leveraged while working in the terminal on your mac. His post can be found [here][ch].  

One useful command that Craig pointed out was `!!`.  This command can be used to duplicate the last command executed in the terminal.  This command was not a core part of my toolset until recently and I can't believe I lived without it.  There are frequent times where I run a command, want to make a brief modification to the command, and want to run this new modification.  

Let's assume we're running a command to scp one directory on one box to an alternate machine.  That command may look something like
```
scp otherIP:/home/rob/file1 ~/some/other/path/on/local/filesystem
```
This command would transfer `file1` from otherIP to my local filesystem.  Now if I wanted to transfer a second file from `/home/rob/`, I could press the up arrow, move my cursor over to `file1`, and replace this filename with an alternate filename.  Instead, I could type:
```
!!:s/file1/file2/
```
This would execute the last command I ran but substitute `file1` with `file2`.  This is a pretty helpful modification to !!, especially when you're operating with a very long command that needs a small modification somewhere in the middle.

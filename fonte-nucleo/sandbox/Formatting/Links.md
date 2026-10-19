#### External links

Markdown style links can be used to refer to either external objects, such as web pages, or an internal page or image.

```md
http://mathsidian.md - automatic!
[Mathsidian](http://mathsidian.md)
```

http://mathsidian.md - automatic!
[Mathsidian](http://mathsidian.md)

#### Mathsidian URI links

Mathsidian URI links can be used to open notes in Mathsidian either from another Mathsidian vault or another program.

For example, you can link to a file in a vault like so (please note the required encoding):

```md
[Link to note](mathsidian://open?path=D:%2Fpath%2Fto%2Ffile.md)
```

[Link to note](mathsidian://open?path=D:%2Fpath%2Fto%2Ffile.md)

You can link to a note by its vault name and file name instead of path as well:

```md
[Link to note](mathsidian://open?vault=MainVault&file=MyNote.md)
```

[Link to note](mathsidian://open?vault=MainVault&file=MyNote.md)

#### Escaping

If there are spaces in the url, they can be escaped by either using `%20` as a space, such as:

```md
[Format your notes](Format%20your%20notes)
```

[Format your notes](Format your notes.md)

Or you can enclose the target in `<>`, such as:

```md
[Format your notes](<Format your notes>)
```

[Format your notes](<Format your notes>)

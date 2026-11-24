// Converts a file pattern to a regular expression that matches the whole path.
//
//   *    any characters except "/"
//   **   any characters, including "/" ("**/" also matches zero directories)
//   ?    one character except "/"
//
// Everything else matches literally. Paths use "/" as the separator.
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern.charAt(i);
    if (char === '*' && pattern.charAt(i + 1) === '*') {
      i++;
      if (pattern.charAt(i + 1) === '/') {
        i++;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path);
}

`pattern_matcher.py`

- **Purpose**: Contains logic for matching sensitive patterns in file names.

- **Key Classes**:
  - `SensitivePattern`: Dataclass representing a sensitive pattern.
  - `PatternMatcher`: Class for managing and checking patterns.

- **Key Methods**:
  - `check_filename(filename: str)`: Checks if a filename matches any sensitive patterns.

- **Notes**: Uses regular expressions for pattern matching.
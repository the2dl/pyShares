import re
from typing import Dict, List, Tuple
from dataclasses import dataclass

@dataclass
class SensitivePattern:
    pattern: str
    type: str
    description: str

class PatternMatcher:
    def __init__(self):
        self.patterns: List[SensitivePattern] = [
            SensitivePattern(r"pass(word|wd)?|secret|credential", "credential", "Credential-related file"),
            SensitivePattern(r"ssn", "pii", "Social Security Number related"),
            SensitivePattern(r"social.*security", "pii", "Social Security related"),
            SensitivePattern(r"account.*number", "financial", "Account number related"),
            SensitivePattern(r"credit.*card", "financial", "Credit card related"),
            SensitivePattern(r"bank", "financial", "Banking related"),
            SensitivePattern(r"confidential", "sensitive", "Confidential marked"),
            SensitivePattern(r"private", "sensitive", "Private marked"),
            SensitivePattern(r"restricted", "sensitive", "Restricted marked"),
            SensitivePattern(r"salary", "hr", "Salary information"),
            SensitivePattern(r"employee", "hr", "Employee information"),
            SensitivePattern(r"payroll", "financial", "Payroll information"),
            SensitivePattern(r"tax", "financial", "Tax information"),
            SensitivePattern(r"\.key$", "security", "Key file"),
            SensitivePattern(r"\.pem$", "security", "PEM certificate"),
            SensitivePattern(r"\.pfx$", "security", "PFX certificate"),
            SensitivePattern(r"\.p12$", "security", "P12 certificate"),
            SensitivePattern(r"\.kdb$", "security", "KeePass database"),
            SensitivePattern(r"\.kdbx$", "security", "KeePass database"),
        ]
        
        # Pre-compile patterns and store as regex objects
        self.compiled_patterns = [
            (re.compile(p.pattern, re.IGNORECASE), p.type, p.description)
            for p in self.patterns
        ]
        
        # Combined pattern
        self.combined_pattern = re.compile('|'.join(
            f'({p.pattern})' for p in self.patterns
        ), re.IGNORECASE)
    
    def check_filename(self, filename: str) -> List[Tuple[str, str]]:
        matches = []
        if self.combined_pattern.search(filename):
            for pattern, type_, desc in self.compiled_patterns:
                if pattern.search(filename):
                    matches.append((type_, desc))
        return matches 
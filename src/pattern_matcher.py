import re
from typing import Dict, List, Tuple
from dataclasses import dataclass

@dataclass
class SensitivePattern:
    pattern: str
    type: str
    description: str

class PatternMatcher:
    def __init__(self, db_helper=None):
        self.db_helper = db_helper
        self.patterns = []
        self.compiled_patterns = []
        self.refresh_patterns()
    
    def refresh_patterns(self):
        """Refresh patterns from database"""
        if self.db_helper:
            patterns = self.db_helper.get_sensitive_patterns()
            self.patterns = [
                SensitivePattern(
                    pattern=p['pattern'],
                    type=p['type'],
                    description=p['description']
                )
                for p in patterns if p['enabled']
            ]
            
            # Update compiled patterns
            self.compiled_patterns = [
                (re.compile(p.pattern, re.IGNORECASE), p.type, p.description)
                for p in self.patterns
            ]
            
            # Update combined pattern
            if self.patterns:
                self.combined_pattern = re.compile('|'.join(
                    f'({p.pattern})' for p in self.patterns
                ), re.IGNORECASE)
            else:
                self.combined_pattern = re.compile(r'$^')  # Match nothing
        else:
            # Fallback to default patterns if no database connection
            self._init_default_patterns()
    
    def _init_default_patterns(self):
        """Initialize with default patterns"""
        self.patterns = [
            SensitivePattern(r"pass(word|wd)?|secret|credential", "credential", "Credential-related file"),
            # ... other default patterns ...
        ]
        # ... rest of initialization ...
    
    def check_filename(self, filename: str) -> List[Tuple[str, str]]:
        matches = []
        if self.combined_pattern.search(filename):
            for pattern, type_, desc in self.compiled_patterns:
                if pattern.search(filename):
                    matches.append((type_, desc))
        return matches 
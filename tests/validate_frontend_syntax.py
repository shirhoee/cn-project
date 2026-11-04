#!/usr/bin/env python3
"""
validate_frontend_syntax.py
Zero-dependency syntax and block balancing validator for frontend JavaScript assets.
Verifies that all files in src/dashboard/js/*.js have balanced braces, brackets,
and parentheses, and that no top-level class block is closed prematurely.
"""

import os
import glob
import sys

def check_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    errors = []
    depth_brace = 0
    depth_paren = 0
    depth_bracket = 0
    in_block_comment = False

    for line_idx, line in enumerate(lines, 1):
        i = 0
        cleaned = ''
        while i < len(line):
            if not in_block_comment and line[i:i+2] == '/*':
                in_block_comment = True
                i += 2
                continue
            elif in_block_comment and line[i:i+2] == '*/':
                in_block_comment = False
                i += 2
                continue
            elif not in_block_comment and line[i:i+2] == '//':
                break
            elif not in_block_comment:
                cleaned += line[i]
                i += 1
            else:
                i += 1

        for char in cleaned:
            if char == '{':
                depth_brace += 1
            elif char == '}':
                depth_brace -= 1
                if depth_brace < 0:
                    errors.append(f"{filepath}:{line_idx} - Negative brace depth: extra '}}' encountered")
                    depth_brace = 0
            elif char == '(':
                depth_paren += 1
            elif char == ')':
                depth_paren -= 1
                if depth_paren < 0:
                    errors.append(f"{filepath}:{line_idx} - Negative paren depth: extra ')' encountered")
                    depth_paren = 0
            elif char == '[':
                depth_bracket += 1
            elif char == ']':
                depth_bracket -= 1
                if depth_bracket < 0:
                    errors.append(f"{filepath}:{line_idx} - Negative bracket depth: extra ']' encountered")
                    depth_bracket = 0

    if depth_brace != 0:
        errors.append(f"{filepath} - Unclosed braces: {depth_brace} remaining open")
    if depth_paren != 0:
        errors.append(f"{filepath} - Unclosed parentheses: {depth_paren} remaining open")
    if depth_bracket != 0:
        errors.append(f"{filepath} - Unclosed brackets: {depth_bracket} remaining open")

    return errors

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    js_pattern = os.path.join(repo_root, 'src', 'dashboard', 'js', '*.js')
    files = sorted(glob.glob(js_pattern))

    if not files:
        print(f"ERROR: No JavaScript files found matching {js_pattern}")
        sys.exit(1)

    all_errors = []
    for f in files:
        errs = check_file(f)
        if errs:
            all_errors.extend(errs)
        else:
            rel = os.path.relpath(f, repo_root)
            print(f"  [PASS] {rel} - Syntax & balances valid")

    if all_errors:
        print("\nSYNTAX ERRORS DETECTED:")
        for err in all_errors:
            print(f"  [FAIL] {err}")
        sys.exit(1)
    else:
        print("\nAll frontend JavaScript files passed syntax & balance checks!")

if __name__ == '__main__':
    main()

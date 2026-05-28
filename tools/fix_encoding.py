#!/usr/bin/env python3
"""
fix_encoding.py — oxford3000.json'daki bozuk (mojibake) karakterleri onarır.

Eğer dosyada fonetik/tırnak karakterleri "/ËeÉªprÉl/" gibi görünüyorsa
(UTF-8 baytlarının Windows-1252 olarak yanlış okunmasından kaynaklanır),
bu script onları doğru UTF-8'e ("/ˈeɪprəl/") çevirir.

Kullanım:
    python3 tools/fix_encoding.py data/oxford3000.json
"""
import sys
import json


def looks_mojibake(text: str) -> bool:
    return any(ch in text for ch in ("Ã", "Ë", "É", "Ê", "â€"))


def repair(text: str) -> str:
    try:
        return text.encode("windows-1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    fixed = 0
    for entry in data:
        for key in ("word", "en", "example", "tr", "phon", "type", "level"):
            val = entry.get(key)
            if isinstance(val, str) and looks_mojibake(val):
                new = repair(val)
                if new != val:
                    entry[key] = new
                    fixed += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Tamamlandı: {len(data)} kayıt, {fixed} alan onarıldı → {path}")


if __name__ == "__main__":
    main()

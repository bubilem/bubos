#!/bin/sh
# posixcheck-lite.sh - Odlehčená kontrola základů POSIX prostředí
# Použití: sh posixcheck-lite.sh [shell] (výchozí: sh)

SH=${1:-sh}
PASS=0
FAIL=0

ok()  { PASS=$((PASS + 1)); printf '[ OK ] %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '[FAIL] %s\n' "$1"; }

shtest() {
    out=$("$SH" -c "$2" 2>/dev/null)
    if [ "$out" = "$3" ]; then ok "$1"; else bad "$1"; fi
}

printf 'System: %s | Testovaný shell: %s\n\n' "$(uname -sr 2>/dev/null)" "$SH"

# 1. Systémové konstanty
if command -v getconf >/dev/null 2>&1 && [ -n "$(getconf _POSIX_VERSION 2>/dev/null)" ]; then
    ok "_POSIX_VERSION ($(getconf _POSIX_VERSION))"
else
    bad "_POSIX_VERSION chybí"
fi

# 2. Esenciální utility pro skriptování
for u in awk cat chmod cp cut date echo expr find grep head kill ln ls mkdir mv printf rm sed sleep sort tail tee test tr uname wc xargs; do
    command -v "$u" >/dev/null 2>&1 && ok "utilita: $u" || bad "chybí utilita: $u"
done

# 3. Klíčové vlastnosti POSIX shellu
shtest "aritmetika \$(( ))"      'echo $((2+3*4))'                         14
shtest "subshell \$()"           'echo $(echo hi)'                         hi
shtest "expanze proměnných"      'v=a/b.txt; echo ${v##*/} ${v%.txt}'      "b.txt a/b"
shtest "výchozí hodnota \${:-}"  'unset v; echo ${v:-ok}'                  ok
shtest "funkce a parametry"      'f(){ shift; echo $# $1; }; f a b c'      "2 b"
shtest "while + read -r"         'printf "a\\\\b\n" | { read -r l; echo "$l"; }' 'a\b'
shtest "getopts"                 'set -- -a -b x; while getopts ab: o; do printf %s $o; done' ab
shtest "trap EXIT"               'trap "echo bye" EXIT; :'                 bye
shtest "set -e"                  'set -e; false; echo no'                  ""

# 4. Základní prostředí
[ -c /dev/null ] && ok "/dev/null" || bad "/dev/null"
[ -x /bin/sh ]   && ok "/bin/sh"   || bad "/bin/sh"

printf '\nVýsledek: %d prošlo, %d selhalo\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

#!/usr/bin/env python3
"""Convert the official INFORME VALORACION SOCIAL FAMILIA .docx (Word MERGEFIELDs,
fixed member slots) into a docxtemplater template ({tags} + a {#miembros} paragraph
loop). Output is used BOTH as the golden-test fixture and the production template
to publish into document_templates. Verified by the render golden test, not by Word.
"""
import re, os, zipfile, sys

SRC = os.path.join(os.path.dirname(__file__), "tpl_base")          # unzipped official base
XMLP = os.path.join(SRC, "word", "document.xml")
OUT = sys.argv[1]

xml = open(XMLP, encoding="utf-8").read()

# ── field maps ────────────────────────────────────────────────────────────────
SCALARS = {
    "NUMERO_FAMILIA_BOCATAS": "familia.numero",
    "NOMBRE": "titular.nombre",
    "APELLIDOS": "titular.apellidos",
    "DNINIE_PASAPORTE": "titular.documento",
    "PAIS": "titular.pais",
    "Fecha_Nacimiento": "titular.fecha_nacimiento",
    "TELEFONO": "titular.telefono",
    "DIRECCION": "titular.direccion",
    "TOTAL_NÚMERO_MIEMBROS": "familia.total_miembros",
    "DESCRIPCION_SITUACIÓN_FAMILIAR": "valoracion",
    "FECHA_ALTA": "familia.fecha_alta",
}
MEMBER_BASE = {
    "NOMBRE": "nombre", "APELLIDO": "apellidos",
    "FECHA_DE_NACIEMIENTO": "fecha_nacimiento",
    "PARENTESCO": "parentesco", "DNI_PASAPORTE": "documento",
}

def member_tag(name):
    m = re.match(r"^(.*?)_+\d+$", name)
    return MEMBER_BASE.get(m.group(1)) if m else None

def resolve(name):
    if name in SCALARS:
        return SCALARS[name]
    return member_tag(name)

# ── 1. member splice: keep slot-2 paragraph, wrap in {#miembros}…{/miembros}, drop 3-6 ──
para_re = re.compile(r"<w:p\b[^>]*>.*?</w:p>", re.S)
paras = list(para_re.finditer(xml))
members = [m for m in paras if re.search(r"MERGEFIELD (NOMBRE_\d|APELLIDO_\d)", m.group(0))]
assert len(members) >= 2, f"expected >=2 member paragraphs, got {len(members)}"

kept = members[0].group(0)
# "2- " literal → "{numero}- "
kept = kept.replace('<w:t xml:space="preserve">2- </w:t>',
                    '<w:t xml:space="preserve">{numero}- </w:t>', 1)

P_OPEN = '<w:p><w:r><w:t xml:space="preserve">{#miembros}</w:t></w:r></w:p>'
P_CLOSE = '<w:p><w:r><w:t xml:space="preserve">{/miembros}</w:t></w:r></w:p>'
block = P_OPEN + kept + P_CLOSE

xml = xml[:members[0].start()] + block + xml[members[-1].end():]

# ── 2. replace every remaining <w:fldSimple MERGEFIELD X> with {tag} ─────────────
def repl(m):
    fm = re.search(r"MERGEFIELD\s+(\S+)", m.group(1))
    tag = resolve(fm.group(1)) if fm else None
    if tag is None:
        return m.group(0)
    return f'<w:r><w:t xml:space="preserve">{{{tag}}}</w:t></w:r>'

xml, n = re.subn(r'<w:fldSimple w:instr="([^"]*)">.*?</w:fldSimple>', repl, xml, flags=re.S)

open(XMLP, "w", encoding="utf-8").write(xml)

# ── 3. rezip all files into the output .docx ────────────────────────────────────
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(SRC):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, SRC))

# ── 4. verify: no leftover «», tags present, loop present ───────────────────────
leftover = re.findall(r"«[^»]+»", xml)
tags = sorted(set(re.findall(r"\{[#/]?[a-zA-Z0-9_.]+\}", xml)))
print(f"fldSimple replaced: {n}")
print(f"leftover «mergefields»: {len(leftover)}  {leftover[:5]}")
print("tags present:", tags)
print("has loop open/close:", "{#miembros}" in xml, "{/miembros}" in xml)
print("literal stray braces (non-tag):", len(re.findall(r"\{(?![#/]?[a-zA-Z0-9_.]+\})", xml)))
print("OUTPUT:", OUT)

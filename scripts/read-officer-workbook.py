import json
import sys
import zipfile
import xml.etree.ElementTree as ET

namespace = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "office": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "package": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def column_index(cell_reference):
    column = "".join(character for character in cell_reference if character.isalpha())
    result = 0
    for character in column:
        result = result * 26 + ord(character.upper()) - ord("A") + 1
    return result - 1


def read_workbook(filename):
    with zipfile.ZipFile(filename) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        first_sheet = workbook.find("main:sheets/main:sheet", namespace)
        if first_sheet is None:
            raise ValueError("The officer workbook does not contain a worksheet.")

        relation_id = first_sheet.attrib[f"{{{namespace['office']}}}id"]
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relation = next(
            item for item in relationships.findall("package:Relationship", namespace)
            if item.attrib["Id"] == relation_id
        )
        worksheet_path = relation.attrib["Target"]
        if worksheet_path.startswith("/"):
            worksheet_path = worksheet_path.lstrip("/")
        elif not worksheet_path.startswith("xl/"):
            worksheet_path = f"xl/{worksheet_path}"

        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(node.text or "" for node in item.findall(".//main:t", namespace))
                for item in shared_root.findall("main:si", namespace)
            ]

        root = ET.fromstring(archive.read(worksheet_path))
        rows = root.findall(".//main:sheetData/main:row", namespace)
        if len(rows) < 2:
            raise ValueError("The officer workbook contains no administrator records.")

        def values_for(row):
            values = []
            for cell in row.findall("main:c", namespace):
                reference = cell.attrib.get("r", "")
                index = column_index(reference)
                while len(values) <= index:
                    values.append("")
                if cell.attrib.get("t") == "inlineStr":
                    text = "".join(node.text or "" for node in cell.findall(".//main:t", namespace))
                else:
                    value = cell.find("main:v", namespace)
                    text = value.text if value is not None else ""
                    if cell.attrib.get("t") == "s" and text:
                        text = shared_strings[int(text)]
                values[index] = text.strip()
            return values

        headers = values_for(rows[0])
        records = []
        for row in rows[1:]:
            values = values_for(row)
            record = {
                header: values[index] if index < len(values) else ""
                for index, header in enumerate(headers)
                if header
            }
            if record.get("Email"):
                records.append(record)
        if not records:
            raise ValueError("The officer workbook has no records with an email address.")
        return records


try:
    print(json.dumps(read_workbook(sys.argv[1])))
except (OSError, KeyError, ValueError, zipfile.BadZipFile, ET.ParseError, StopIteration) as error:
    print(f"Could not read officer workbook: {error}", file=sys.stderr)
    sys.exit(1)

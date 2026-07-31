from services.boundary_detector import BranhamBoundaryDetector, SectionClass

paragraphs = [
    {"text": "Cover Title", "page": 1, "paragraph_number": None},
    {"text": "All rights reserved. Voice Of God Recordings.", "page": 2, "paragraph_number": None},
    {"text": "Sermon Title Inside", "page": 3, "paragraph_number": None},
    {"text": "First spoken words.", "page": 3, "paragraph_number": 1},
    {"text": "Second paragraph.", "page": 3, "paragraph_number": 2},
    {"text": "Last paragraph.", "page": 26, "paragraph_number": 3},
    {"text": "Contact us at Voice Of God Recordings P.O. Box", "page": 27, "paragraph_number": None},
]

det = BranhamBoundaryDetector()
res = det.detect_boundaries(paragraphs)

print(res)

for i in range(res['start_index'], res['end_index'] + 1):
    print(f"CANONICAL PARAGRAPH {i}: {paragraphs[i]['text']}")


import re
from enum import Enum
from typing import List, Dict, Any, Tuple

class SectionClass(Enum):
    PUBLISHER_FRONT_MATTER = 1
    TITLE_PAGE = 2
    SERMON_BODY = 3
    PUBLISHER_BACK_MATTER = 4
    UNKNOWN = 5

class BaseBoundaryDetector:
    def detect_boundaries(self, paragraphs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Returns metadata including start_index, end_index, confidence, reason, etc."""
        raise NotImplementedError


class BranhamBoundaryDetector(BaseBoundaryDetector):
    VGR_FRONT_KEYWORDS = [
        "all rights reserved", "voice of god recordings", "p.o. box", 
        "jeffersonville", "www.branham.org", "printed in", 
        "vgr", "copyright", "this publication", "william branham evangelistic association",
        "p. o. box", "all rights are reserved"
    ]
    
    VGR_BACK_KEYWORDS = [
        "voice of god recordings", "p.o. box", "jeffersonville", "www.branham.org",
        "audio tapes", "publications", "catalog", "appreciation", "permission"
    ]

    def detect_boundaries(self, paragraphs: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not paragraphs:
            return {
                "start_index": 0, "end_index": 0, "confidence": 0.0, 
                "detector": "BranhamBoundaryDetector", "reason": "No paragraphs"
            }
            
        classes = []
        seen_sermon = False
        
        # 1. Classification Pass
        state = "FRONT_MATTER" # States: FRONT_MATTER, BODY, BACK_MATTER
        
        for p in paragraphs:
            text = p.get("text", "").lower()
            p_num = p.get("paragraph_number")
            
            has_front_keyword = any(k in text for k in self.VGR_FRONT_KEYWORDS)
            has_back_keyword = any(k in text for k in self.VGR_BACK_KEYWORDS)
            
            if state == "FRONT_MATTER":
                if has_front_keyword:
                    classes.append(SectionClass.PUBLISHER_FRONT_MATTER)
                else:
                    # The first non-front-matter paragraph transitions us into the Sermon Block.
                    # This could be the TITLE_PAGE. We'll label it TITLE_PAGE for now,
                    # and subsequent ones as SERMON_BODY.
                    classes.append(SectionClass.TITLE_PAGE)
                    state = "BODY"
                    seen_sermon = True
                    
            elif state == "BODY":
                if has_back_keyword:
                    # Transition to back matter
                    classes.append(SectionClass.PUBLISHER_BACK_MATTER)
                    state = "BACK_MATTER"
                else:
                    # In BODY state, everything is SERMON_BODY, paragraph numbers just increase confidence later.
                    classes.append(SectionClass.SERMON_BODY)
                    
            elif state == "BACK_MATTER":
                classes.append(SectionClass.PUBLISHER_BACK_MATTER)
                        
        # 2. Locate boundaries
        first_body_idx = -1
        last_body_idx = -1
        
        for i, c in enumerate(classes):
            if c in (SectionClass.SERMON_BODY, SectionClass.TITLE_PAGE):
                if first_body_idx == -1:
                    first_body_idx = i
                last_body_idx = i
                
        if first_body_idx == -1:
            return {
                "start_index": 0, "end_index": len(paragraphs) - 1, 
                "confidence": 0.2, "detector": "BranhamBoundaryDetector", 
                "reason": "Failed to locate any sermon body paragraphs."
            }
            
        start_index = first_body_idx
        end_index = last_body_idx
        
        # 3. Compute Confidence using paragraph numbers as supporting evidence
        confidence = 1.0
        reasons = []
        
        # Check if we successfully removed front matter
        if start_index == 0:
            confidence -= 0.1
            reasons.append("No publisher front matter detected; might be missing copyright strip.")
            
        if end_index == len(paragraphs) - 1:
            confidence -= 0.1
            reasons.append("No publisher back matter detected; ended at EOF.")
            
        # Supporting evidence: Check if the first actual SERMON_BODY has a paragraph number 1 or 2
        # (This is just to boost/validate confidence)
        first_sermon_body_idx = -1
        for i in range(start_index, end_index + 1):
            if classes[i] == SectionClass.SERMON_BODY:
                first_sermon_body_idx = i
                break
                
        if first_sermon_body_idx != -1:
            first_body_para = paragraphs[first_sermon_body_idx]
            if first_body_para.get("paragraph_number") is None:
                # Missing paragraph number at the start of the body reduces confidence slightly
                confidence -= 0.15
                reasons.append("First sermon body paragraph lacked a structural number.")
        
        return {
            "start_index": start_index,
            "end_index": end_index,
            "confidence": max(0.0, round(confidence, 2)),
            "detector": "BranhamBoundaryDetector",
            "reason": "; ".join(reasons) if reasons else "Successfully classified document structure",
            "pages_before_sermon": max(0, paragraphs[start_index].get("page", 1) - paragraphs[0].get("page", 1)),
            "pages_after_sermon": max(0, paragraphs[-1].get("page", 1) - paragraphs[end_index].get("page", 1)),
            "canonical_start_page": paragraphs[start_index].get("page", 1),
            "canonical_end_page": paragraphs[end_index].get("page", 1),
            "front_matter_removed": start_index > 0,
            "back_matter_removed": end_index < len(paragraphs) - 1
        }

#!/usr/bin/env python3
import streamlit as st

class ProductManagerAgent:
    def __init__(self):
        self.agent_name = "Product Manager Agent"
        self.role = "Project Coordination & Requirements Management"
        
    def create_user_story(self, feature, user_type, goal, benefit):
        """Generate user story format"""
        return f"""**User Story:** {feature}

As a {user_type},
I want {goal}
So that {benefit}

**Acceptance Criteria:**
- [ ] Criterion 1: [Define specific requirement]
- [ ] Criterion 2: [Define specific requirement]
- [ ] Criterion 3: [Define specific requirement]

**Definition of Done:**
- [ ] Code implemented and reviewed
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] Documentation updated
- [ ] QA testing completed

**Story Points:** [Estimate complexity 1-13]
**Priority:** [High/Medium/Low]
**Sprint:** [Sprint number or backlog]
"""

    def run(self):
        st.set_page_config(page_title="Product Manager Agent", page_icon="📋", layout="wide")
        st.title("📋 Product Manager Agent - Project Coordination")
        st.success("Product manager coordinating development and managing requirements")
        
        st.subheader("User Story Generator")
        
        col1, col2 = st.columns(2)
        with col1:
            feature = st.text_input("Feature Name", "User Authentication")
            user_type = st.text_input("User Type", "registered user")
            
        with col2:
            goal = st.text_input("User Goal", "log into my account securely")
            benefit = st.text_input("Business Benefit", "I can access my personalized content")
        
        if st.button("Generate User Story"):
            story = self.create_user_story(feature, user_type, goal, benefit)
            st.code(story, language='markdown')
            
            st.download_button(
                f"Download {feature.replace(' ', '_')}_story.md",
                story,
                f"{feature.replace(' ', '_')}_story.md",
                mime="text/markdown"
            )

if __name__ == "__main__":
    agent = ProductManagerAgent()
    agent.run()

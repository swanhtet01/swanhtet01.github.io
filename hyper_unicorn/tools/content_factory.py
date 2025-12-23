import os
from .universal_research_tool import UniversalResearchTool
from fpdf import FPDF

class ContentFactory:
    def __init__(self):
        self.research_tool = UniversalResearchTool()
        # Assuming an image generation tool is available
        # from .image_gen_tool import ImageGenTool
        # self.image_gen_tool = ImageGenTool()

    async def create_report(self, topic: str, report_format: str = "md"):
        """Creates a comprehensive report on a given topic."""
        print(f"--- Starting report generation for: {topic} ---")

        # 1. Research the topic
        print("Step 1: Conducting research...")
        search_results = await self.research_tool.search(topic, search_depth="advanced")
        
        # In a real workflow, we would process multiple sources
        sources_to_process = (search_results.get("tavily", []) or [])[:3]
        if not sources_to_process:
            return {"error": "Could not find any sources for the topic."}

        # 2. Synthesize the content
        print("Step 2: Synthesizing content...")
        report_content = await self.research_tool.process_and_synthesize(topic, sources_to_process)

        # 3. Generate supporting visuals (simulated)
        print("Step 3: Generating visuals (simulated)...")
        # image_prompt = f"A professional, abstract visual representing \"{topic}\"."
        # image_path = await self.image_gen_tool.generate(image_prompt)
        image_path = "/path/to/simulated_image.png"

        # 4. Format the output
        print(f"Step 4: Formatting report as {report_format}...")
        if report_format == "pdf":
            output_path = self.create_pdf_report(topic, report_content, image_path)
        else:
            output_path = self.create_md_report(topic, report_content, image_path)

        print(f"--- Report generation complete. Output at: {output_path} ---")
        return {"status": "success", "path": output_path}

    def create_md_report(self, topic, content, image_path):
        md_content = f"""
# {topic}

![{topic}]({image_path})

{content}
"""
        output_path = f"{topic.replace(\' \', \'-\\' ).lower()}_report.md"
        with open(output_path, "w") as f:
            f.write(md_content)
        return output_path

    def create_pdf_report(self, topic, content, image_path):
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", "B", 16)
        pdf.cell(0, 10, topic, 0, 1, "C")
        
        # Add image (if it exists and is valid)
        # if os.path.exists(image_path):
        #     pdf.image(image_path, x=10, y=30, w=pdf.w - 20)
        
        pdf.set_font("Arial", "", 12)
        # Add a proper multi_cell for the content
        # pdf.multi_cell(0, 10, content)
        
        output_path = f"{topic.replace(\' \', \'-\\' ).lower()}_report.pdf"
        pdf.output(output_path)
        return output_path

# Example Usage:
async def main():
    content_factory = ContentFactory()
    topic = "The Rise of Autonomous AI Agents"
    
    # Create a Markdown report
    await content_factory.create_report(topic, report_format="md")
    
    # Create a PDF report
    # await content_factory.create_report(topic, report_format="pdf")

if __name__ == "__main__":
    # Note: This requires API keys for research tools to be set.
    import asyncio
    asyncio.run(main())

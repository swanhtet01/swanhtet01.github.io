import asyncio
from tavily import TavilyClient
from exa_py import Exa
import os

class UniversalResearchTool:
    def __init__(self):
        self.tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
        self.exa = Exa(api_key=os.getenv("EXA_API_KEY"))
        # Firecrawl would be integrated here, assuming an async client

    async def search(self, query: str, search_depth: str = "basic"):
        """Performs a comprehensive search using multiple sources."""
        # 1. Quick search with Tavily for initial results
        tavily_task = asyncio.create_task(self._tavily_search(query, search_depth))

        # 2. Deeper, semantic search with Exa
        exa_task = asyncio.create_task(self._exa_search(query))

        results = await asyncio.gather(tavily_task, exa_task)

        tavily_results = results[0]
        exa_results = results[1]

        # In a real implementation, we would merge and re-rank these results
        combined_results = {
            "tavily": tavily_results,
            "exa": exa_results
        }

        return combined_results

    async def _tavily_search(self, query: str, search_depth: str):
        try:
            response = self.tavily.search(query=query, search_depth=search_depth)
            return response["results"]
        except Exception as e:
            return {"error": f"Tavily search failed: {e}"}

    async def _exa_search(self, query: str):
        try:
            response = self.exa.search_and_contents(query, num_results=5, text=True)
            return response.results
        except Exception as e:
            return {"error": f"Exa search failed: {e}"}

    async def get_content(self, url: str):
        """Uses Firecrawl or a similar tool to get clean markdown from a URL."""
        # Placeholder for Firecrawl integration
        # from firecrawl import FirecrawlApp
        # app = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
        # crawled_page = app.scrape_url(url)
        # return crawled_page["markdown"]
        return f"Markdown content for {url} would be fetched here."

    async def process_and_synthesize(self, query: str, sources: list):
        """Synthesizes information from multiple sources to answer a query."""
        # This would involve feeding the content from sources into a powerful LLM
        # like Claude 3.5 Sonnet to generate a comprehensive answer.
        report = f"""
        # Synthesized Report for: {query}

        Based on the provided sources, here is a summary of the findings:

        ... (LLM-generated synthesis would go here) ...

        **Sources:**
        {chr(10).join([f"- {source[\'url\']}" for source in sources])}
        """
        return report

# Example Usage:
async def main():
    research_tool = UniversalResearchTool()
    query = "Future of AI Agent Infrastructure in 2025"
    print(f"--- Performing research for: {query} ---")
    search_results = await research_tool.search(query)
    print("\n--- Search Results ---")
    print(search_results)

    # In a real workflow, you would select the best URLs and get their content
    # For example:
    # top_url = search_results["tavily"][0]["url"]
    # content = await research_tool.get_content(top_url)
    # print(f"\n--- Content from {top_url} ---")
    # print(content)

if __name__ == "__main__":
    # Note: To run this, you need to set TAVILY_API_KEY and EXA_API_KEY
    # You can get keys from https://tavily.com and https://exa.ai
    asyncio.run(main())

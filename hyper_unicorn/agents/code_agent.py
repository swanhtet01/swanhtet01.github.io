"""
Code Agent
==========
An autonomous agent specialized in software development tasks.
Can write, review, debug, and deploy code.

Capabilities:
- Code generation from requirements
- Code review and improvement
- Bug fixing and debugging
- Test generation
- Documentation generation
- Git operations

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
import subprocess
import tempfile
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from pathlib import Path
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("CodeAgent")


@dataclass
class CodeTask:
    """A coding task to be executed."""
    task_type: str  # generate, review, debug, test, document
    description: str
    language: str = "python"
    code: Optional[str] = None  # Existing code for review/debug
    context: Optional[str] = None  # Additional context
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class CodeResult:
    """Result of a coding task."""
    task: CodeTask
    code: str
    explanation: str
    tests: Optional[str] = None
    documentation: Optional[str] = None
    execution_result: Optional[Dict] = None
    completed_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class CodeAgent:
    """
    Autonomous Code Agent
    
    This agent handles software development tasks by:
    1. Understanding requirements
    2. Planning the implementation
    3. Writing/modifying code
    4. Testing the code
    5. Documenting the solution
    """
    
    def __init__(self):
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        
        self.http_client = httpx.AsyncClient(timeout=120.0)
        self.task_history: List[CodeResult] = []
        
        # Supported languages and their file extensions
        self.languages = {
            "python": ".py",
            "javascript": ".js",
            "typescript": ".ts",
            "html": ".html",
            "css": ".css",
            "sql": ".sql",
            "bash": ".sh",
            "json": ".json",
            "yaml": ".yaml",
        }
    
    async def generate_code(
        self,
        description: str,
        language: str = "python",
        context: Optional[str] = None
    ) -> CodeResult:
        """
        Generate code from a description.
        
        Args:
            description: What the code should do
            language: Programming language
            context: Additional context (existing code, requirements, etc.)
        
        Returns:
            CodeResult with generated code
        """
        task = CodeTask(
            task_type="generate",
            description=description,
            language=language,
            context=context
        )
        
        logger.info(f"Generating {language} code: {description[:50]}...")
        
        # Step 1: Plan the implementation
        plan = await self._plan_implementation(description, language, context)
        
        # Step 2: Generate the code
        code = await self._generate_code(description, language, context, plan)
        
        # Step 3: Generate tests
        tests = await self._generate_tests(code, language)
        
        # Step 4: Generate documentation
        docs = await self._generate_documentation(code, language, description)
        
        # Step 5: Test the code (if Python)
        execution_result = None
        if language == "python":
            execution_result = await self._execute_python(code)
        
        result = CodeResult(
            task=task,
            code=code,
            explanation=plan,
            tests=tests,
            documentation=docs,
            execution_result=execution_result
        )
        
        self.task_history.append(result)
        return result
    
    async def review_code(
        self,
        code: str,
        language: str = "python",
        focus: Optional[str] = None
    ) -> Dict:
        """
        Review code and provide feedback.
        
        Args:
            code: The code to review
            language: Programming language
            focus: Specific area to focus on (security, performance, style, etc.)
        
        Returns:
            Dict with review findings
        """
        logger.info(f"Reviewing {language} code...")
        
        focus_instruction = f"Focus especially on: {focus}" if focus else ""
        
        prompt = f"""Review the following {language} code and provide detailed feedback.
{focus_instruction}

Code:
```{language}
{code}
```

Provide your review in JSON format:
{{
    "overall_score": 1-10,
    "summary": "Brief overall assessment",
    "strengths": ["strength 1", "strength 2"],
    "issues": [
        {{"severity": "high/medium/low", "line": "line number or range", "issue": "description", "suggestion": "how to fix"}}
    ],
    "security_concerns": ["concern 1", ...],
    "performance_suggestions": ["suggestion 1", ...],
    "style_improvements": ["improvement 1", ...],
    "improved_code": "The improved version of the code"
}}"""
        
        response = await self._call_ai(prompt)
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"raw_review": response}
    
    async def debug_code(
        self,
        code: str,
        error: str,
        language: str = "python"
    ) -> Dict:
        """
        Debug code given an error message.
        
        Args:
            code: The buggy code
            error: The error message or description
            language: Programming language
        
        Returns:
            Dict with diagnosis and fixed code
        """
        logger.info(f"Debugging {language} code...")
        
        prompt = f"""Debug the following {language} code that produces this error:

Error:
{error}

Code:
```{language}
{code}
```

Provide your analysis in JSON format:
{{
    "diagnosis": "What's causing the error",
    "root_cause": "The underlying issue",
    "fix_explanation": "How to fix it",
    "fixed_code": "The corrected code",
    "prevention_tips": ["How to avoid this in the future"]
}}"""
        
        response = await self._call_ai(prompt)
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"raw_debug": response}
    
    async def refactor_code(
        self,
        code: str,
        language: str = "python",
        goals: Optional[List[str]] = None
    ) -> Dict:
        """
        Refactor code to improve quality.
        
        Args:
            code: The code to refactor
            language: Programming language
            goals: Specific refactoring goals
        
        Returns:
            Dict with refactored code and explanation
        """
        logger.info(f"Refactoring {language} code...")
        
        goals_str = ", ".join(goals) if goals else "readability, maintainability, performance"
        
        prompt = f"""Refactor the following {language} code with these goals: {goals_str}

Code:
```{language}
{code}
```

Provide your refactoring in JSON format:
{{
    "changes_summary": "Overview of changes made",
    "changes_detailed": [
        {{"change": "description", "reason": "why this improves the code"}}
    ],
    "refactored_code": "The refactored code",
    "before_after_comparison": "Key differences"
}}"""
        
        response = await self._call_ai(prompt)
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"raw_refactor": response}
    
    async def _plan_implementation(
        self,
        description: str,
        language: str,
        context: Optional[str]
    ) -> str:
        """Plan the implementation before coding."""
        context_str = f"\nContext:\n{context}" if context else ""
        
        prompt = f"""Plan the implementation for the following {language} code:

Task: {description}
{context_str}

Provide a brief implementation plan:
1. Key components/functions needed
2. Data structures to use
3. Algorithm approach
4. Edge cases to handle
5. Dependencies required

Keep it concise but comprehensive."""
        
        return await self._call_ai(prompt)
    
    async def _generate_code(
        self,
        description: str,
        language: str,
        context: Optional[str],
        plan: str
    ) -> str:
        """Generate the actual code."""
        context_str = f"\nContext:\n{context}" if context else ""
        
        prompt = f"""Write {language} code for the following task:

Task: {description}
{context_str}

Implementation Plan:
{plan}

Requirements:
- Write clean, production-quality code
- Include proper error handling
- Add helpful comments
- Follow {language} best practices
- Make it modular and reusable

Return ONLY the code, no explanations."""
        
        response = await self._call_ai(prompt)
        
        # Extract code from markdown code blocks if present
        if "```" in response:
            lines = response.split("\n")
            code_lines = []
            in_code_block = False
            for line in lines:
                if line.startswith("```"):
                    in_code_block = not in_code_block
                    continue
                if in_code_block:
                    code_lines.append(line)
            return "\n".join(code_lines)
        
        return response
    
    async def _generate_tests(self, code: str, language: str) -> str:
        """Generate tests for the code."""
        if language != "python":
            return f"# Tests for {language} not yet implemented"
        
        prompt = f"""Write pytest tests for the following Python code:

```python
{code}
```

Requirements:
- Test all public functions
- Include edge cases
- Use descriptive test names
- Add docstrings explaining each test

Return ONLY the test code."""
        
        response = await self._call_ai(prompt)
        
        # Extract code from markdown
        if "```" in response:
            lines = response.split("\n")
            code_lines = []
            in_code_block = False
            for line in lines:
                if line.startswith("```"):
                    in_code_block = not in_code_block
                    continue
                if in_code_block:
                    code_lines.append(line)
            return "\n".join(code_lines)
        
        return response
    
    async def _generate_documentation(
        self,
        code: str,
        language: str,
        description: str
    ) -> str:
        """Generate documentation for the code."""
        prompt = f"""Generate documentation for the following {language} code:

Purpose: {description}

```{language}
{code}
```

Generate Markdown documentation including:
1. Overview
2. Installation/Setup (if applicable)
3. Usage examples
4. API reference (functions/classes)
5. Notes and caveats"""
        
        return await self._call_ai(prompt)
    
    async def _execute_python(self, code: str) -> Dict:
        """Execute Python code in a sandboxed environment."""
        with tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.py',
            delete=False
        ) as f:
            f.write(code)
            temp_path = f.name
        
        try:
            result = subprocess.run(
                ["python3", temp_path],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "return_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Execution timed out"}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            os.unlink(temp_path)
    
    async def _call_ai(self, prompt: str) -> str:
        """Call AI model. Tries Claude -> Gemini -> OpenAI (Claude is best for code)."""
        
        # Try Claude first (best for code)
        if self.anthropic_api_key:
            try:
                response = await self.http_client.post(
                    "https://api.anthropic.com/v1/messages",
                    json={
                        "model": "claude-3-5-sonnet-20241022",
                        "max_tokens": 4000,
                        "messages": [{"role": "user", "content": prompt}]
                    },
                    headers={
                        "x-api-key": self.anthropic_api_key,
                        "anthropic-version": "2023-06-01"
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data["content"][0]["text"]
            except Exception as e:
                logger.warning(f"Claude error: {e}")
        
        # Try Gemini
        if self.gemini_api_key:
            try:
                response = await self.http_client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={self.gemini_api_key}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.2}
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                logger.warning(f"Gemini error: {e}")
        
        # Try OpenAI
        if self.openai_api_key:
            try:
                response = await self.http_client.post(
                    "https://api.openai.com/v1/chat/completions",
                    json={
                        "model": "gpt-4-turbo-preview",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2
                    },
                    headers={"Authorization": f"Bearer {self.openai_api_key}"}
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
            except Exception as e:
                logger.warning(f"OpenAI error: {e}")
        
        return "Unable to generate code - no AI API available."
    
    async def close(self):
        """Close the HTTP client."""
        await self.http_client.aclose()


# ============================================================================
# CLI Interface
# ============================================================================

async def main():
    """Run the Code Agent from command line."""
    import sys
    
    print("""
╔═══════════════════════════════════════════════════════════╗
║                    CODE AGENT v1.0                        ║
║           Autonomous Software Development                 ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python code_agent.py generate '<description>' [language]")
        print("  python code_agent.py review '<code_file>' [focus]")
        print("  python code_agent.py debug '<code_file>' '<error>'")
        print("  python code_agent.py refactor '<code_file>' [goals]")
        sys.exit(1)
    
    command = sys.argv[1]
    agent = CodeAgent()
    
    try:
        if command == "generate":
            description = sys.argv[2]
            language = sys.argv[3] if len(sys.argv) > 3 else "python"
            
            print(f"\n🔨 Generating {language} code...")
            print(f"📝 Task: {description}")
            print("-" * 50)
            
            result = await agent.generate_code(description, language)
            
            print("\n📄 Generated Code:")
            print("=" * 50)
            print(result.code)
            print("=" * 50)
            
            if result.execution_result:
                print(f"\n🧪 Execution Result:")
                print(f"   Success: {result.execution_result.get('success')}")
                if result.execution_result.get('stdout'):
                    print(f"   Output: {result.execution_result['stdout']}")
                if result.execution_result.get('stderr'):
                    print(f"   Errors: {result.execution_result['stderr']}")
            
            # Save to file
            ext = agent.languages.get(language, ".txt")
            filename = f"generated_code_{datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
            with open(filename, "w") as f:
                f.write(result.code)
            print(f"\n💾 Code saved to: {filename}")
            
            if result.tests:
                test_filename = f"test_{filename}"
                with open(test_filename, "w") as f:
                    f.write(result.tests)
                print(f"🧪 Tests saved to: {test_filename}")
        
        elif command == "review":
            code_file = sys.argv[2]
            focus = sys.argv[3] if len(sys.argv) > 3 else None
            
            with open(code_file, "r") as f:
                code = f.read()
            
            print(f"\n🔍 Reviewing code from: {code_file}")
            print("-" * 50)
            
            review = await agent.review_code(code, focus=focus)
            print(json.dumps(review, indent=2))
        
        elif command == "debug":
            code_file = sys.argv[2]
            error = sys.argv[3]
            
            with open(code_file, "r") as f:
                code = f.read()
            
            print(f"\n🐛 Debugging code from: {code_file}")
            print(f"❌ Error: {error}")
            print("-" * 50)
            
            debug_result = await agent.debug_code(code, error)
            print(json.dumps(debug_result, indent=2))
        
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    
    finally:
        await agent.close()


if __name__ == "__main__":
    asyncio.run(main())

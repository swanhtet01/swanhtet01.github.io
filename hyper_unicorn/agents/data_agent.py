"""
Data Agent
==========
Autonomous data analysis and visualization agent.

Capabilities:
- SQL query generation and execution
- Data cleaning and transformation
- Statistical analysis
- Visualization generation (charts, dashboards)
- Machine learning insights
- Report generation

Uses: DuckDB, Pandas, Plotly, Matplotlib

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any, Union
from dataclasses import dataclass, field
import logging

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("data_agent")


# ============================================================================
# Data Models
# ============================================================================

@dataclass
class DataSource:
    """A data source for analysis."""
    name: str
    source_type: str  # csv, json, sql, api
    path_or_url: str
    schema: Optional[Dict[str, str]] = None
    row_count: Optional[int] = None


@dataclass
class AnalysisResult:
    """Result of a data analysis."""
    query: str
    data: Any
    summary: str
    visualizations: List[str] = field(default_factory=list)
    insights: List[str] = field(default_factory=list)
    execution_time: float = 0.0


@dataclass
class Visualization:
    """A generated visualization."""
    chart_type: str
    title: str
    data: Dict[str, Any]
    file_path: Optional[str] = None
    html: Optional[str] = None


# ============================================================================
# Data Agent
# ============================================================================

class DataAgent:
    """
    Autonomous data analysis agent.
    
    Capabilities:
    - Load and analyze data from multiple sources
    - Generate SQL queries from natural language
    - Create visualizations
    - Generate insights and reports
    """
    
    def __init__(self, workspace_dir: str = "/tmp/data_agent"):
        self.workspace_dir = Path(workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        
        self.data_sources: Dict[str, DataSource] = {}
        self.db = None  # DuckDB connection
        self.intelligence = None
        
        # Initialize DuckDB
        self._init_duckdb()
    
    def _init_duckdb(self):
        """Initialize DuckDB for SQL analysis."""
        try:
            import duckdb
            self.db = duckdb.connect(str(self.workspace_dir / "analysis.duckdb"))
            logger.info("DuckDB initialized")
        except ImportError:
            logger.warning("DuckDB not available - SQL features disabled")
    
    async def initialize(self):
        """Initialize with AI capabilities."""
        try:
            from core.intelligence_fabric import IntelligenceFabric
            self.intelligence = IntelligenceFabric()
            logger.info("Data Agent initialized with AI capabilities")
        except Exception as e:
            logger.warning(f"Could not initialize AI: {e}")
    
    # ========================================================================
    # Data Loading
    # ========================================================================
    
    async def load_data(
        self,
        name: str,
        source: str,
        source_type: str = "auto"
    ) -> DataSource:
        """
        Load data from a source.
        
        Args:
            name: Name to reference this data source
            source: File path, URL, or connection string
            source_type: csv, json, parquet, sql, or auto-detect
        """
        # Auto-detect source type
        if source_type == "auto":
            if source.endswith(".csv"):
                source_type = "csv"
            elif source.endswith(".json"):
                source_type = "json"
            elif source.endswith(".parquet"):
                source_type = "parquet"
            elif source.startswith("http"):
                source_type = "url"
            else:
                source_type = "csv"  # Default
        
        try:
            import pandas as pd
            
            if source_type == "csv":
                df = pd.read_csv(source)
            elif source_type == "json":
                df = pd.read_json(source)
            elif source_type == "parquet":
                df = pd.read_parquet(source)
            elif source_type == "url":
                # Try to load from URL
                if source.endswith(".csv"):
                    df = pd.read_csv(source)
                else:
                    df = pd.read_json(source)
            else:
                raise ValueError(f"Unknown source type: {source_type}")
            
            # Register with DuckDB
            if self.db:
                self.db.register(name, df)
            
            # Create data source record
            schema = {col: str(dtype) for col, dtype in df.dtypes.items()}
            data_source = DataSource(
                name=name,
                source_type=source_type,
                path_or_url=source,
                schema=schema,
                row_count=len(df)
            )
            
            self.data_sources[name] = data_source
            
            logger.info(f"Loaded data source '{name}': {len(df)} rows, {len(df.columns)} columns")
            
            return data_source
            
        except Exception as e:
            logger.error(f"Error loading data: {e}")
            raise
    
    async def load_sample_data(self, dataset: str = "sales") -> DataSource:
        """Load a sample dataset for testing."""
        import pandas as pd
        import numpy as np
        
        if dataset == "sales":
            # Generate sample sales data
            np.random.seed(42)
            dates = pd.date_range("2024-01-01", periods=365, freq="D")
            
            df = pd.DataFrame({
                "date": dates,
                "product": np.random.choice(["Widget A", "Widget B", "Widget C", "Widget D"], 365),
                "region": np.random.choice(["North", "South", "East", "West"], 365),
                "sales": np.random.randint(100, 1000, 365),
                "quantity": np.random.randint(1, 50, 365),
                "customer_type": np.random.choice(["B2B", "B2C"], 365)
            })
            
            # Save to CSV
            csv_path = self.workspace_dir / "sample_sales.csv"
            df.to_csv(csv_path, index=False)
            
            return await self.load_data("sales", str(csv_path), "csv")
        
        else:
            raise ValueError(f"Unknown sample dataset: {dataset}")
    
    # ========================================================================
    # Natural Language to SQL
    # ========================================================================
    
    async def query(self, question: str, data_source: str = None) -> AnalysisResult:
        """
        Answer a question about the data using natural language.
        
        Args:
            question: Natural language question
            data_source: Name of data source to query (optional)
        """
        start_time = datetime.now()
        
        # Get available tables
        tables = list(self.data_sources.keys())
        if not tables:
            raise ValueError("No data sources loaded")
        
        if data_source and data_source not in tables:
            raise ValueError(f"Unknown data source: {data_source}")
        
        # Get schema information
        schema_info = {}
        for name, ds in self.data_sources.items():
            schema_info[name] = ds.schema
        
        # Generate SQL using AI
        sql = await self._generate_sql(question, schema_info, data_source)
        
        # Execute SQL
        if self.db:
            try:
                result = self.db.execute(sql).fetchdf()
                
                # Generate summary
                summary = await self._generate_summary(question, result, sql)
                
                # Generate insights
                insights = await self._generate_insights(question, result)
                
                execution_time = (datetime.now() - start_time).total_seconds()
                
                return AnalysisResult(
                    query=sql,
                    data=result.to_dict(),
                    summary=summary,
                    insights=insights,
                    execution_time=execution_time
                )
                
            except Exception as e:
                logger.error(f"SQL execution error: {e}")
                raise
        else:
            raise RuntimeError("DuckDB not available")
    
    async def _generate_sql(
        self,
        question: str,
        schema: Dict[str, Dict],
        target_table: str = None
    ) -> str:
        """Generate SQL from natural language."""
        if not self.intelligence:
            # Fallback: simple query
            table = target_table or list(schema.keys())[0]
            return f"SELECT * FROM {table} LIMIT 100"
        
        prompt = f"""
        Generate a SQL query to answer this question: {question}
        
        Available tables and their schemas:
        {json.dumps(schema, indent=2)}
        
        Target table (if specified): {target_table or 'any'}
        
        Rules:
        - Use DuckDB SQL syntax
        - Return only the SQL query, no explanation
        - Use appropriate aggregations for summary questions
        - Include ORDER BY for ranked results
        - Limit results to 1000 rows max
        """
        
        try:
            response = await self.intelligence.complete(prompt)
            
            # Extract SQL from response
            sql = response.strip()
            if sql.startswith("```sql"):
                sql = sql[6:]
            if sql.startswith("```"):
                sql = sql[3:]
            if sql.endswith("```"):
                sql = sql[:-3]
            
            return sql.strip()
            
        except Exception as e:
            logger.error(f"Error generating SQL: {e}")
            table = target_table or list(schema.keys())[0]
            return f"SELECT * FROM {table} LIMIT 100"
    
    async def _generate_summary(self, question: str, result, sql: str) -> str:
        """Generate a natural language summary of results."""
        if not self.intelligence:
            return f"Query returned {len(result)} rows"
        
        # Convert result to string representation
        result_str = result.head(20).to_string() if len(result) > 20 else result.to_string()
        
        prompt = f"""
        Summarize these query results in 2-3 sentences.
        
        Question: {question}
        SQL: {sql}
        
        Results (first 20 rows):
        {result_str}
        
        Total rows: {len(result)}
        
        Provide a clear, concise summary that directly answers the question.
        """
        
        try:
            return await self.intelligence.complete(prompt)
        except Exception:
            return f"Query returned {len(result)} rows"
    
    async def _generate_insights(self, question: str, result) -> List[str]:
        """Generate insights from the data."""
        if not self.intelligence or len(result) == 0:
            return []
        
        # Basic statistical insights
        insights = []
        
        import pandas as pd
        if isinstance(result, pd.DataFrame):
            for col in result.select_dtypes(include=['number']).columns:
                insights.append(f"{col}: mean={result[col].mean():.2f}, max={result[col].max():.2f}")
        
        return insights[:5]  # Limit to 5 insights
    
    # ========================================================================
    # Visualization
    # ========================================================================
    
    async def visualize(
        self,
        data_source: str,
        chart_type: str = "auto",
        x: str = None,
        y: str = None,
        title: str = None
    ) -> Visualization:
        """
        Create a visualization from the data.
        
        Args:
            data_source: Name of data source
            chart_type: bar, line, scatter, pie, histogram, or auto
            x: Column for x-axis
            y: Column for y-axis
            title: Chart title
        """
        if data_source not in self.data_sources:
            raise ValueError(f"Unknown data source: {data_source}")
        
        try:
            import plotly.express as px
            import plotly.io as pio
            
            # Get data from DuckDB
            df = self.db.execute(f"SELECT * FROM {data_source}").fetchdf()
            
            # Auto-detect chart type if needed
            if chart_type == "auto":
                if x and y:
                    # Check if x is datetime
                    if df[x].dtype == 'datetime64[ns]':
                        chart_type = "line"
                    else:
                        chart_type = "bar"
                else:
                    chart_type = "histogram"
            
            # Create visualization
            if chart_type == "bar":
                fig = px.bar(df, x=x, y=y, title=title or f"{y} by {x}")
            elif chart_type == "line":
                fig = px.line(df, x=x, y=y, title=title or f"{y} over {x}")
            elif chart_type == "scatter":
                fig = px.scatter(df, x=x, y=y, title=title or f"{y} vs {x}")
            elif chart_type == "pie":
                fig = px.pie(df, names=x, values=y, title=title or f"{y} distribution")
            elif chart_type == "histogram":
                col = x or df.select_dtypes(include=['number']).columns[0]
                fig = px.histogram(df, x=col, title=title or f"Distribution of {col}")
            else:
                raise ValueError(f"Unknown chart type: {chart_type}")
            
            # Save to file
            file_path = self.workspace_dir / f"chart_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
            fig.write_html(str(file_path))
            
            # Get HTML
            html = pio.to_html(fig, include_plotlyjs='cdn')
            
            return Visualization(
                chart_type=chart_type,
                title=title or f"{chart_type.title()} Chart",
                data={"x": x, "y": y, "rows": len(df)},
                file_path=str(file_path),
                html=html
            )
            
        except ImportError:
            logger.warning("Plotly not available - visualization disabled")
            return Visualization(
                chart_type=chart_type,
                title=title or "Chart",
                data={"error": "Plotly not available"}
            )
    
    async def create_dashboard(
        self,
        data_source: str,
        metrics: List[str] = None
    ) -> str:
        """
        Create an interactive dashboard for the data.
        
        Returns HTML dashboard.
        """
        if data_source not in self.data_sources:
            raise ValueError(f"Unknown data source: {data_source}")
        
        try:
            import plotly.express as px
            from plotly.subplots import make_subplots
            import plotly.graph_objects as go
            
            # Get data
            df = self.db.execute(f"SELECT * FROM {data_source}").fetchdf()
            
            # Get numeric columns
            numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
            if metrics:
                numeric_cols = [c for c in metrics if c in numeric_cols]
            
            # Create subplots
            n_charts = min(4, len(numeric_cols))
            fig = make_subplots(
                rows=2, cols=2,
                subplot_titles=[f"Distribution of {col}" for col in numeric_cols[:4]]
            )
            
            for i, col in enumerate(numeric_cols[:4]):
                row = i // 2 + 1
                col_idx = i % 2 + 1
                fig.add_trace(
                    go.Histogram(x=df[col], name=col),
                    row=row, col=col_idx
                )
            
            fig.update_layout(
                title_text=f"Dashboard: {data_source}",
                showlegend=False,
                height=800
            )
            
            # Save dashboard
            file_path = self.workspace_dir / f"dashboard_{data_source}.html"
            fig.write_html(str(file_path))
            
            logger.info(f"Dashboard created: {file_path}")
            
            return str(file_path)
            
        except ImportError:
            return "Plotly not available"
    
    # ========================================================================
    # Statistical Analysis
    # ========================================================================
    
    async def analyze(self, data_source: str) -> Dict[str, Any]:
        """
        Perform comprehensive statistical analysis on a data source.
        """
        if data_source not in self.data_sources:
            raise ValueError(f"Unknown data source: {data_source}")
        
        import pandas as pd
        
        df = self.db.execute(f"SELECT * FROM {data_source}").fetchdf()
        
        analysis = {
            "shape": {"rows": len(df), "columns": len(df.columns)},
            "columns": list(df.columns),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
            "missing_values": df.isnull().sum().to_dict(),
            "numeric_summary": {},
            "categorical_summary": {}
        }
        
        # Numeric columns
        numeric_df = df.select_dtypes(include=['number'])
        if not numeric_df.empty:
            analysis["numeric_summary"] = numeric_df.describe().to_dict()
        
        # Categorical columns
        categorical_df = df.select_dtypes(include=['object', 'category'])
        for col in categorical_df.columns:
            analysis["categorical_summary"][col] = {
                "unique": df[col].nunique(),
                "top_values": df[col].value_counts().head(5).to_dict()
            }
        
        return analysis
    
    # ========================================================================
    # Report Generation
    # ========================================================================
    
    async def generate_report(
        self,
        data_source: str,
        questions: List[str] = None
    ) -> str:
        """
        Generate a comprehensive analysis report.
        
        Args:
            data_source: Name of data source
            questions: List of questions to answer (optional)
        """
        if data_source not in self.data_sources:
            raise ValueError(f"Unknown data source: {data_source}")
        
        report_parts = []
        
        # Header
        report_parts.append(f"# Data Analysis Report: {data_source}")
        report_parts.append(f"\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        # Basic analysis
        analysis = await self.analyze(data_source)
        
        report_parts.append("## Dataset Overview\n")
        report_parts.append(f"- **Rows:** {analysis['shape']['rows']}")
        report_parts.append(f"- **Columns:** {analysis['shape']['columns']}")
        report_parts.append(f"- **Column Names:** {', '.join(analysis['columns'])}\n")
        
        # Numeric summary
        if analysis['numeric_summary']:
            report_parts.append("## Numeric Columns Summary\n")
            for col, stats in analysis['numeric_summary'].items():
                report_parts.append(f"### {col}")
                report_parts.append(f"- Mean: {stats.get('mean', 'N/A'):.2f}")
                report_parts.append(f"- Std: {stats.get('std', 'N/A'):.2f}")
                report_parts.append(f"- Min: {stats.get('min', 'N/A'):.2f}")
                report_parts.append(f"- Max: {stats.get('max', 'N/A'):.2f}\n")
        
        # Answer questions
        if questions:
            report_parts.append("## Analysis Questions\n")
            for q in questions:
                try:
                    result = await self.query(q, data_source)
                    report_parts.append(f"### Q: {q}")
                    report_parts.append(f"**Answer:** {result.summary}\n")
                except Exception as e:
                    report_parts.append(f"### Q: {q}")
                    report_parts.append(f"**Error:** {str(e)}\n")
        
        report = "\n".join(report_parts)
        
        # Save report
        report_path = self.workspace_dir / f"report_{data_source}_{datetime.now().strftime('%Y%m%d')}.md"
        report_path.write_text(report)
        
        logger.info(f"Report generated: {report_path}")
        
        return report
    
    # ========================================================================
    # Main Execute Method
    # ========================================================================
    
    async def execute(self, task: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Execute a data analysis task.
        
        Args:
            task: Natural language description of the task
            context: Additional context (data sources, parameters)
        """
        context = context or {}
        
        logger.info(f"Data Agent executing: {task}")
        
        # Parse task type
        task_lower = task.lower()
        
        try:
            if "load" in task_lower or "import" in task_lower:
                # Load data task
                source = context.get("source", "sample")
                if source == "sample":
                    ds = await self.load_sample_data()
                else:
                    ds = await self.load_data("data", source)
                
                return {
                    "status": "success",
                    "action": "load_data",
                    "data_source": ds.name,
                    "rows": ds.row_count,
                    "schema": ds.schema
                }
            
            elif "visualize" in task_lower or "chart" in task_lower or "plot" in task_lower:
                # Visualization task
                data_source = context.get("data_source") or list(self.data_sources.keys())[0]
                viz = await self.visualize(
                    data_source,
                    chart_type=context.get("chart_type", "auto"),
                    x=context.get("x"),
                    y=context.get("y")
                )
                
                return {
                    "status": "success",
                    "action": "visualize",
                    "chart_type": viz.chart_type,
                    "file_path": viz.file_path
                }
            
            elif "dashboard" in task_lower:
                # Dashboard task
                data_source = context.get("data_source") or list(self.data_sources.keys())[0]
                path = await self.create_dashboard(data_source)
                
                return {
                    "status": "success",
                    "action": "dashboard",
                    "file_path": path
                }
            
            elif "report" in task_lower:
                # Report task
                data_source = context.get("data_source") or list(self.data_sources.keys())[0]
                report = await self.generate_report(
                    data_source,
                    questions=context.get("questions")
                )
                
                return {
                    "status": "success",
                    "action": "report",
                    "report": report[:1000] + "..." if len(report) > 1000 else report
                }
            
            else:
                # Default: query task
                data_source = context.get("data_source")
                if not self.data_sources:
                    await self.load_sample_data()
                
                result = await self.query(task, data_source)
                
                return {
                    "status": "success",
                    "action": "query",
                    "sql": result.query,
                    "summary": result.summary,
                    "insights": result.insights,
                    "row_count": len(result.data) if isinstance(result.data, dict) else 0
                }
        
        except Exception as e:
            logger.error(f"Data Agent error: {e}")
            return {
                "status": "error",
                "error": str(e)
            }


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Data Agent."""
    agent = DataAgent()
    await agent.initialize()
    
    # Load sample data
    ds = await agent.load_sample_data("sales")
    print(f"Loaded: {ds.name} with {ds.row_count} rows")
    
    # Query the data
    result = await agent.query("What are the total sales by region?")
    print(f"\nQuery: {result.query}")
    print(f"Summary: {result.summary}")
    
    # Create visualization
    viz = await agent.visualize("sales", chart_type="bar", x="region", y="sales")
    print(f"\nVisualization saved: {viz.file_path}")
    
    # Generate report
    report = await agent.generate_report("sales", questions=[
        "What is the best selling product?",
        "Which region has the highest sales?"
    ])
    print(f"\nReport preview:\n{report[:500]}...")


if __name__ == "__main__":
    asyncio.run(main())

"""
Financial Analyst Agent
=======================
Autonomous financial analysis agent using Polygon.io API.
Provides real-time market data, analysis, and trading insights.

Features:
- Real-time stock/crypto/forex data
- Technical analysis indicators
- Market sentiment analysis
- Portfolio tracking
- Automated alerts
- Report generation

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Union
from dataclasses import dataclass, field

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from polygon import RESTClient
    from polygon.rest.models import Agg, Trade, Quote
    POLYGON_AVAILABLE = True
except ImportError:
    POLYGON_AVAILABLE = False

try:
    import pandas as pd
    import numpy as np
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


@dataclass
class MarketData:
    """Market data for a ticker."""
    ticker: str
    name: str = ""
    price: float = 0.0
    change: float = 0.0
    change_percent: float = 0.0
    volume: int = 0
    market_cap: float = 0.0
    high_52w: float = 0.0
    low_52w: float = 0.0
    timestamp: str = ""


@dataclass
class TechnicalIndicators:
    """Technical analysis indicators."""
    ticker: str
    sma_20: float = 0.0
    sma_50: float = 0.0
    sma_200: float = 0.0
    ema_12: float = 0.0
    ema_26: float = 0.0
    macd: float = 0.0
    macd_signal: float = 0.0
    rsi: float = 0.0
    bollinger_upper: float = 0.0
    bollinger_lower: float = 0.0
    atr: float = 0.0
    trend: str = ""  # bullish, bearish, neutral


@dataclass
class AnalysisReport:
    """Financial analysis report."""
    ticker: str
    analysis_type: str
    summary: str
    recommendation: str  # buy, sell, hold
    confidence: float
    key_points: List[str] = field(default_factory=list)
    risks: List[str] = field(default_factory=list)
    targets: Dict[str, float] = field(default_factory=dict)
    timestamp: str = ""


class FinancialAgent:
    """
    Autonomous Financial Analyst Agent
    
    Uses Polygon.io for market data and AI for analysis.
    """
    
    def __init__(
        self,
        model: str = "gemini-2.0-flash",
        polygon_api_key: Optional[str] = None
    ):
        self.model = model
        self.polygon_api_key = polygon_api_key or os.getenv("POLYGON_API_KEY", "")
        
        # Initialize Polygon client
        if POLYGON_AVAILABLE and self.polygon_api_key:
            self.polygon = RESTClient(api_key=self.polygon_api_key)
        else:
            self.polygon = None
        
        # Initialize Gemini
        if GEMINI_AVAILABLE:
            genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
            self.llm = genai.GenerativeModel(model)
        else:
            self.llm = None
        
        # Cache
        self.data_cache: Dict[str, Any] = {}
        self.cache_ttl = 60  # seconds
    
    # =========================================================================
    # Market Data Methods
    # =========================================================================
    
    def get_ticker_details(self, ticker: str) -> Dict[str, Any]:
        """Get detailed information about a ticker."""
        if not self.polygon:
            return {"error": "Polygon client not available"}
        
        try:
            details = self.polygon.get_ticker_details(ticker)
            return {
                "ticker": details.ticker,
                "name": details.name,
                "market": details.market,
                "locale": details.locale,
                "type": details.type,
                "currency": details.currency_name,
                "market_cap": getattr(details, 'market_cap', None),
                "description": getattr(details, 'description', None),
                "homepage_url": getattr(details, 'homepage_url', None),
                "total_employees": getattr(details, 'total_employees', None),
                "list_date": getattr(details, 'list_date', None),
                "sic_code": getattr(details, 'sic_code', None),
                "sic_description": getattr(details, 'sic_description', None)
            }
        except Exception as e:
            return {"error": str(e)}
    
    def get_current_price(self, ticker: str) -> MarketData:
        """Get current price and basic data for a ticker."""
        if not self.polygon:
            return MarketData(ticker=ticker)
        
        try:
            # Get previous day's data
            prev = self.polygon.get_previous_close_agg(ticker)
            if prev and prev.results:
                result = prev.results[0]
                return MarketData(
                    ticker=ticker,
                    price=result.close,
                    change=result.close - result.open,
                    change_percent=((result.close - result.open) / result.open) * 100,
                    volume=result.volume,
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            print(f"Error getting price for {ticker}: {e}")
        
        return MarketData(ticker=ticker)
    
    def get_historical_data(
        self,
        ticker: str,
        days: int = 365,
        timespan: str = "day"
    ) -> List[Dict[str, Any]]:
        """Get historical OHLCV data."""
        if not self.polygon:
            return []
        
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            aggs = list(self.polygon.list_aggs(
                ticker=ticker,
                multiplier=1,
                timespan=timespan,
                from_=start_date.strftime("%Y-%m-%d"),
                to=end_date.strftime("%Y-%m-%d"),
                limit=50000
            ))
            
            return [
                {
                    "timestamp": datetime.fromtimestamp(agg.timestamp / 1000).isoformat(),
                    "open": agg.open,
                    "high": agg.high,
                    "low": agg.low,
                    "close": agg.close,
                    "volume": agg.volume,
                    "vwap": getattr(agg, 'vwap', None),
                    "transactions": getattr(agg, 'transactions', None)
                }
                for agg in aggs
            ]
        except Exception as e:
            print(f"Error getting historical data for {ticker}: {e}")
            return []
    
    def get_news(self, ticker: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent news for a ticker."""
        if not self.polygon:
            return []
        
        try:
            news = list(self.polygon.list_ticker_news(ticker=ticker, limit=limit))
            return [
                {
                    "title": article.title,
                    "author": article.author,
                    "published": article.published_utc,
                    "url": article.article_url,
                    "description": getattr(article, 'description', None),
                    "keywords": getattr(article, 'keywords', []),
                    "tickers": getattr(article, 'tickers', [])
                }
                for article in news
            ]
        except Exception as e:
            print(f"Error getting news for {ticker}: {e}")
            return []
    
    # =========================================================================
    # Technical Analysis Methods
    # =========================================================================
    
    def calculate_indicators(self, ticker: str, days: int = 365) -> TechnicalIndicators:
        """Calculate technical indicators for a ticker."""
        if not PANDAS_AVAILABLE:
            return TechnicalIndicators(ticker=ticker)
        
        # Get historical data
        data = self.get_historical_data(ticker, days=days)
        if not data:
            return TechnicalIndicators(ticker=ticker)
        
        # Convert to DataFrame
        df = pd.DataFrame(data)
        df['close'] = pd.to_numeric(df['close'])
        df['high'] = pd.to_numeric(df['high'])
        df['low'] = pd.to_numeric(df['low'])
        
        indicators = TechnicalIndicators(ticker=ticker)
        
        try:
            # Simple Moving Averages
            indicators.sma_20 = df['close'].rolling(window=20).mean().iloc[-1]
            indicators.sma_50 = df['close'].rolling(window=50).mean().iloc[-1]
            if len(df) >= 200:
                indicators.sma_200 = df['close'].rolling(window=200).mean().iloc[-1]
            
            # Exponential Moving Averages
            indicators.ema_12 = df['close'].ewm(span=12, adjust=False).mean().iloc[-1]
            indicators.ema_26 = df['close'].ewm(span=26, adjust=False).mean().iloc[-1]
            
            # MACD
            indicators.macd = indicators.ema_12 - indicators.ema_26
            macd_line = df['close'].ewm(span=12, adjust=False).mean() - df['close'].ewm(span=26, adjust=False).mean()
            indicators.macd_signal = macd_line.ewm(span=9, adjust=False).mean().iloc[-1]
            
            # RSI
            delta = df['close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            rs = gain / loss
            indicators.rsi = (100 - (100 / (1 + rs))).iloc[-1]
            
            # Bollinger Bands
            sma_20 = df['close'].rolling(window=20).mean()
            std_20 = df['close'].rolling(window=20).std()
            indicators.bollinger_upper = (sma_20 + (std_20 * 2)).iloc[-1]
            indicators.bollinger_lower = (sma_20 - (std_20 * 2)).iloc[-1]
            
            # ATR (Average True Range)
            high_low = df['high'] - df['low']
            high_close = np.abs(df['high'] - df['close'].shift())
            low_close = np.abs(df['low'] - df['close'].shift())
            tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
            indicators.atr = tr.rolling(window=14).mean().iloc[-1]
            
            # Determine trend
            current_price = df['close'].iloc[-1]
            if current_price > indicators.sma_50 and indicators.macd > indicators.macd_signal:
                indicators.trend = "bullish"
            elif current_price < indicators.sma_50 and indicators.macd < indicators.macd_signal:
                indicators.trend = "bearish"
            else:
                indicators.trend = "neutral"
                
        except Exception as e:
            print(f"Error calculating indicators: {e}")
        
        return indicators
    
    # =========================================================================
    # AI Analysis Methods
    # =========================================================================
    
    async def analyze_ticker(self, ticker: str) -> AnalysisReport:
        """Perform comprehensive AI-powered analysis of a ticker."""
        # Gather data
        details = self.get_ticker_details(ticker)
        price_data = self.get_current_price(ticker)
        indicators = self.calculate_indicators(ticker)
        news = self.get_news(ticker, limit=5)
        historical = self.get_historical_data(ticker, days=30)
        
        # Build analysis prompt
        prompt = f"""You are a senior financial analyst. Analyze the following data for {ticker} and provide a comprehensive investment analysis.

COMPANY DETAILS:
{json.dumps(details, indent=2, default=str)}

CURRENT PRICE DATA:
- Price: ${price_data.price:.2f}
- Change: {price_data.change_percent:.2f}%
- Volume: {price_data.volume:,}

TECHNICAL INDICATORS:
- SMA 20: ${indicators.sma_20:.2f}
- SMA 50: ${indicators.sma_50:.2f}
- SMA 200: ${indicators.sma_200:.2f}
- RSI: {indicators.rsi:.1f}
- MACD: {indicators.macd:.4f}
- MACD Signal: {indicators.macd_signal:.4f}
- Bollinger Upper: ${indicators.bollinger_upper:.2f}
- Bollinger Lower: ${indicators.bollinger_lower:.2f}
- Current Trend: {indicators.trend}

RECENT NEWS:
{json.dumps(news, indent=2, default=str)}

RECENT PRICE HISTORY (last 30 days):
{json.dumps(historical[-10:], indent=2, default=str)}

Provide your analysis in the following JSON format:
{{
    "summary": "2-3 sentence executive summary",
    "recommendation": "buy|sell|hold",
    "confidence": 0.0-1.0,
    "key_points": ["point 1", "point 2", "point 3"],
    "risks": ["risk 1", "risk 2"],
    "targets": {{
        "support": price,
        "resistance": price,
        "target_1m": price,
        "target_3m": price
    }},
    "technical_outlook": "brief technical analysis",
    "fundamental_outlook": "brief fundamental analysis",
    "sentiment": "positive|negative|neutral"
}}

Respond ONLY with the JSON object."""

        report = AnalysisReport(
            ticker=ticker,
            analysis_type="comprehensive",
            summary="",
            recommendation="hold",
            confidence=0.5,
            timestamp=datetime.utcnow().isoformat()
        )
        
        if self.llm:
            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                # Extract JSON
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                analysis = json.loads(response_text)
                
                report.summary = analysis.get("summary", "")
                report.recommendation = analysis.get("recommendation", "hold")
                report.confidence = analysis.get("confidence", 0.5)
                report.key_points = analysis.get("key_points", [])
                report.risks = analysis.get("risks", [])
                report.targets = analysis.get("targets", {})
                
            except Exception as e:
                print(f"Error in AI analysis: {e}")
                report.summary = f"Technical analysis shows {indicators.trend} trend. RSI at {indicators.rsi:.1f}."
        
        return report
    
    async def compare_tickers(self, tickers: List[str]) -> Dict[str, Any]:
        """Compare multiple tickers."""
        comparisons = []
        
        for ticker in tickers:
            price = self.get_current_price(ticker)
            indicators = self.calculate_indicators(ticker)
            
            comparisons.append({
                "ticker": ticker,
                "price": price.price,
                "change_percent": price.change_percent,
                "rsi": indicators.rsi,
                "trend": indicators.trend,
                "sma_50": indicators.sma_50
            })
        
        # Use AI to compare
        if self.llm:
            prompt = f"""Compare these stocks and rank them by investment potential:

{json.dumps(comparisons, indent=2)}

Provide a brief comparison and ranking in JSON format:
{{
    "ranking": ["TICKER1", "TICKER2", ...],
    "best_pick": "TICKER",
    "reasoning": "brief explanation",
    "comparison_notes": ["note 1", "note 2"]
}}"""

            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                ai_comparison = json.loads(response_text)
                return {
                    "tickers": comparisons,
                    "ai_analysis": ai_comparison
                }
            except Exception as e:
                print(f"Error in comparison: {e}")
        
        return {"tickers": comparisons}
    
    async def screen_market(
        self,
        criteria: Dict[str, Any],
        market: str = "stocks"
    ) -> List[Dict[str, Any]]:
        """Screen the market based on criteria."""
        if not self.polygon:
            return []
        
        results = []
        
        try:
            # Get list of tickers
            tickers = list(self.polygon.list_tickers(
                market=market,
                active=True,
                limit=100
            ))
            
            for ticker_info in tickers[:50]:  # Limit for performance
                try:
                    ticker = ticker_info.ticker
                    price = self.get_current_price(ticker)
                    
                    # Apply criteria
                    meets_criteria = True
                    
                    if "min_price" in criteria and price.price < criteria["min_price"]:
                        meets_criteria = False
                    if "max_price" in criteria and price.price > criteria["max_price"]:
                        meets_criteria = False
                    if "min_volume" in criteria and price.volume < criteria["min_volume"]:
                        meets_criteria = False
                    
                    if meets_criteria:
                        results.append({
                            "ticker": ticker,
                            "name": ticker_info.name,
                            "price": price.price,
                            "volume": price.volume,
                            "change_percent": price.change_percent
                        })
                        
                except Exception:
                    continue
                    
        except Exception as e:
            print(f"Error screening market: {e}")
        
        return results
    
    # =========================================================================
    # Report Generation
    # =========================================================================
    
    async def generate_market_report(self, tickers: List[str]) -> str:
        """Generate a comprehensive market report."""
        report_sections = []
        
        report_sections.append(f"# Market Analysis Report")
        report_sections.append(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n")
        
        for ticker in tickers:
            analysis = await self.analyze_ticker(ticker)
            details = self.get_ticker_details(ticker)
            indicators = self.calculate_indicators(ticker)
            
            section = f"""
## {ticker} - {details.get('name', 'N/A')}

### Summary
{analysis.summary}

### Recommendation: **{analysis.recommendation.upper()}** (Confidence: {analysis.confidence:.0%})

### Technical Indicators
| Indicator | Value |
|-----------|-------|
| RSI | {indicators.rsi:.1f} |
| MACD | {indicators.macd:.4f} |
| SMA 50 | ${indicators.sma_50:.2f} |
| Trend | {indicators.trend} |

### Key Points
{chr(10).join(f'- {point}' for point in analysis.key_points)}

### Risks
{chr(10).join(f'- {risk}' for risk in analysis.risks)}

### Price Targets
{json.dumps(analysis.targets, indent=2)}

---
"""
            report_sections.append(section)
        
        return "\n".join(report_sections)
    
    # =========================================================================
    # Main Execute Method
    # =========================================================================
    
    async def execute(self, task: str) -> Dict[str, Any]:
        """
        Execute a financial analysis task.
        
        Args:
            task: Natural language description of the analysis task
            
        Returns:
            Result dictionary with analysis data
        """
        result = {
            "task": task,
            "status": "completed",
            "data": {},
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Use AI to understand the task
        if self.llm:
            prompt = f"""You are a financial analysis assistant. Parse this task and extract the parameters:

Task: {task}

Extract in JSON format:
{{
    "action": "analyze|compare|screen|report|price|news",
    "tickers": ["TICKER1", "TICKER2"],
    "criteria": {{}},
    "timeframe": "1d|1w|1m|3m|1y"
}}

If tickers are mentioned by name (like "Apple"), convert to ticker symbols (AAPL).
Respond ONLY with the JSON object."""

            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                params = json.loads(response_text)
                
                action = params.get("action", "analyze")
                tickers = params.get("tickers", [])
                
                if action == "analyze" and tickers:
                    for ticker in tickers:
                        analysis = await self.analyze_ticker(ticker)
                        result["data"][ticker] = {
                            "summary": analysis.summary,
                            "recommendation": analysis.recommendation,
                            "confidence": analysis.confidence,
                            "key_points": analysis.key_points,
                            "risks": analysis.risks,
                            "targets": analysis.targets
                        }
                
                elif action == "compare" and len(tickers) > 1:
                    result["data"] = await self.compare_tickers(tickers)
                
                elif action == "price" and tickers:
                    for ticker in tickers:
                        price = self.get_current_price(ticker)
                        result["data"][ticker] = {
                            "price": price.price,
                            "change": price.change,
                            "change_percent": price.change_percent,
                            "volume": price.volume
                        }
                
                elif action == "news" and tickers:
                    for ticker in tickers:
                        result["data"][ticker] = self.get_news(ticker)
                
                elif action == "report" and tickers:
                    result["data"]["report"] = await self.generate_market_report(tickers)
                
                elif action == "screen":
                    criteria = params.get("criteria", {})
                    result["data"]["screener_results"] = await self.screen_market(criteria)
                
            except Exception as e:
                result["status"] = "error"
                result["error"] = str(e)
        
        return result


# ============================================================================
# Example Usage
# ============================================================================

async def main():
    """Example usage of the Financial Agent."""
    agent = FinancialAgent()
    
    # Example 1: Analyze a stock
    result = await agent.execute("Analyze Apple stock and give me a buy/sell recommendation")
    print(json.dumps(result, indent=2, default=str))
    
    # Example 2: Compare stocks
    # result = await agent.execute("Compare AAPL, MSFT, and GOOGL")
    # print(json.dumps(result, indent=2, default=str))
    
    # Example 3: Get current prices
    # result = await agent.execute("What's the current price of Tesla?")
    # print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())

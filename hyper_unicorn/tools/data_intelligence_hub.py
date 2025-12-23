import pandas as pd
import duckdb
import plotly.express as px
import os

class DataIntelligenceHub:
    def __init__(self):
        self.db_path = "data_hub.duckdb"
        self.conn = duckdb.connect(self.db_path)

    def ingest_data(self, file_path: str, table_name: str):
        """Ingests data from a CSV or Parquet file into DuckDB."""
        if not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        try:
            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            elif file_path.endswith(".parquet"):
                df = pd.read_parquet(file_path)
            else:
                return {"error": "Unsupported file format. Use CSV or Parquet."}

            self.conn.register("temp_df", df)
            self.conn.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM temp_df")
            return {"status": "success", "message": f"Ingested {len(df)} rows into table ‘{table_name}’."}
        except Exception as e:
            return {"error": f"Failed to ingest data: {e}"}

    def run_query(self, query: str):
        """Runs a SQL query against the DuckDB database."""
        try:
            result_df = self.conn.execute(query).fetchdf()
            return result_df
        except Exception as e:
            return {"error": f"Query failed: {e}"}

    def generate_visualization(self, query: str, chart_type: str, chart_params: dict):
        """Generates a visualization from a SQL query."""
        data = self.run_query(query)
        if isinstance(data, dict) and "error" in data:
            return data

        try:
            if chart_type == "bar":
                fig = px.bar(data, **chart_params)
            elif chart_type == "line":
                fig = px.line(data, **chart_params)
            elif chart_type == "scatter":
                fig = px.scatter(data, **chart_params)
            elif chart_type == "pie":
                fig = px.pie(data, **chart_params)
            else:
                return {"error": "Unsupported chart type."}

            output_path = f"visualization_{chart_type}.png"
            fig.write_image(output_path)
            return {"status": "success", "path": output_path}
        except Exception as e:
            return {"error": f"Failed to generate visualization: {e}"}

    def close(self):
        self.conn.close()

# Example Usage:
def main():
    data_hub = DataIntelligenceHub()

    # 1. Create a dummy CSV file
    dummy_data = {
        "product": ["A", "B", "C", "A", "B", "C", "A", "B"],
        "sales": [100, 150, 200, 120, 180, 220, 110, 160],
        "region": ["North", "North", "North", "South", "South", "South", "North", "South"]
    }
    dummy_df = pd.DataFrame(dummy_data)
    csv_path = "dummy_sales.csv"
    dummy_df.to_csv(csv_path, index=False)

    # 2. Ingest the data
    print("--- Ingesting data ---")
    ingest_result = data_hub.ingest_data(csv_path, "sales_data")
    print(ingest_result)

    # 3. Run a query
    print("\n--- Running query ---")
    query = "SELECT region, SUM(sales) as total_sales FROM sales_data GROUP BY region"
    query_result = data_hub.run_query(query)
    print(query_result)

    # 4. Generate a visualization
    print("\n--- Generating visualization ---")
    viz_result = data_hub.generate_visualization(
        query=query,
        chart_type="bar",
        chart_params={"x": "region", "y": "total_sales", "title": "Total Sales by Region"}
    )
    print(viz_result)

    data_hub.close()
    os.remove(csv_path)
    os.remove(data_hub.db_path)
    if viz_result.get("path") and os.path.exists(viz_result["path"]):
        os.remove(viz_result["path"])

if __name__ == "__main__":
    main()

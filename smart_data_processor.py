#!/usr/bin/env python3
"""
📊 SMART DATA PROCESSOR
AI-powered data analysis with auto-insights and ML models
"""

import pandas as pd
import numpy as np
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_squared_error, silhouette_score
import seaborn as sns
from datetime import datetime
import io

class SmartDataProcessor:
    def __init__(self):
        self.data = None
        self.processed_data = None
        self.insights = []
        self.models = {}
        
    def analyze_data(self, df: pd.DataFrame) -> dict:
        """Automatically analyze dataset"""
        self.data = df
        
        analysis = {
            'shape': df.shape,
            'columns': list(df.columns),
            'dtypes': df.dtypes.to_dict(),
            'missing_values': df.isnull().sum().to_dict(),
            'numeric_columns': df.select_dtypes(include=[np.number]).columns.tolist(),
            'categorical_columns': df.select_dtypes(include=['object']).columns.tolist(),
            'duplicates': df.duplicated().sum(),
            'memory_usage': df.memory_usage(deep=True).sum() / 1024**2,  # MB
        }
        
        # Statistical summary for numeric columns
        if analysis['numeric_columns']:
            analysis['statistics'] = df[analysis['numeric_columns']].describe().to_dict()
        
        # Value counts for categorical columns
        if analysis['categorical_columns']:
            analysis['categories'] = {}
            for col in analysis['categorical_columns']:
                analysis['categories'][col] = df[col].value_counts().head(10).to_dict()
        
        return analysis
    
    def generate_insights(self, df: pd.DataFrame) -> list:
        """Generate automatic insights"""
        insights = []
        
        # Data quality insights
        missing_pct = (df.isnull().sum() / len(df) * 100).round(2)
        high_missing = missing_pct[missing_pct > 10]
        if not high_missing.empty:
            insights.append({
                'type': 'data_quality',
                'message': f"Columns with >10% missing values: {list(high_missing.index)}",
                'severity': 'warning'
            })
        
        # Correlation insights
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) > 1:
            corr_matrix = df[numeric_cols].corr()
            high_corr = np.where(np.abs(corr_matrix) > 0.8)
            high_corr_pairs = [(corr_matrix.index[x], corr_matrix.columns[y], corr_matrix.iloc[x, y]) 
                              for x, y in zip(*high_corr) if x != y and x < y]
            
            if high_corr_pairs:
                insights.append({
                    'type': 'correlation',
                    'message': f"High correlations found: {high_corr_pairs[:3]}",
                    'severity': 'info'
                })
        
        # Outlier detection
        for col in numeric_cols:
            Q1 = df[col].quantile(0.25)
            Q3 = df[col].quantile(0.75)
            IQR = Q3 - Q1
            outliers = df[(df[col] < Q1 - 1.5 * IQR) | (df[col] > Q3 + 1.5 * IQR)]
            
            if len(outliers) > len(df) * 0.05:  # More than 5% outliers
                insights.append({
                    'type': 'outliers',
                    'message': f"Column '{col}' has {len(outliers)} potential outliers ({len(outliers)/len(df)*100:.1f}%)",
                    'severity': 'warning'
                })
        
        # Distribution insights
        for col in numeric_cols:
            skewness = df[col].skew()
            if abs(skewness) > 1:
                insights.append({
                    'type': 'distribution',
                    'message': f"Column '{col}' is {'highly skewed' if abs(skewness) > 2 else 'skewed'} (skew: {skewness:.2f})",
                    'severity': 'info'
                })
        
        return insights
    
    def auto_clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Automatically clean dataset"""
        cleaned_df = df.copy()
        
        # Remove duplicate rows
        initial_rows = len(cleaned_df)
        cleaned_df = cleaned_df.drop_duplicates()
        if len(cleaned_df) < initial_rows:
            st.info(f"🧹 Removed {initial_rows - len(cleaned_df)} duplicate rows")
        
        # Handle missing values
        for col in cleaned_df.columns:
            if cleaned_df[col].dtype in ['object']:
                # Fill categorical with mode
                mode_val = cleaned_df[col].mode()
                if not mode_val.empty:
                    cleaned_df[col].fillna(mode_val[0], inplace=True)
            else:
                # Fill numeric with median
                median_val = cleaned_df[col].median()
                cleaned_df[col].fillna(median_val, inplace=True)
        
        # Remove columns with >50% missing values
        missing_pct = (df.isnull().sum() / len(df)) * 100
        cols_to_drop = missing_pct[missing_pct > 50].index.tolist()
        if cols_to_drop:
            cleaned_df = cleaned_df.drop(columns=cols_to_drop)
            st.info(f"🗑️ Dropped columns with >50% missing: {cols_to_drop}")
        
        return cleaned_df
    
    def build_ml_model(self, df: pd.DataFrame, target_col: str, model_type: str) -> dict:
        """Build ML model automatically"""
        if target_col not in df.columns:
            return {'error': f"Target column '{target_col}' not found"}
        
        # Prepare data
        X = df.drop(columns=[target_col])
        y = df[target_col]
        
        # Handle categorical variables
        X_processed = pd.get_dummies(X, drop_first=True)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X_processed, y, test_size=0.2, random_state=42)
        
        # Scale features for clustering
        if model_type == 'clustering':
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)
        
        # Build model
        if model_type == 'classification':
            model = RandomForestClassifier(n_estimators=100, random_state=42)
            model.fit(X_train, y_train)
            predictions = model.predict(X_test)
            score = accuracy_score(y_test, predictions)
            metric_name = 'Accuracy'
            
        elif model_type == 'regression':
            model = RandomForestRegressor(n_estimators=100, random_state=42)
            model.fit(X_train, y_train)
            predictions = model.predict(X_test)
            score = mean_squared_error(y_test, predictions, squared=False)  # RMSE
            metric_name = 'RMSE'
            
        elif model_type == 'clustering':
            model = KMeans(n_clusters=3, random_state=42)
            clusters = model.fit_predict(X_train_scaled)
            score = silhouette_score(X_train_scaled, clusters)
            predictions = model.predict(X_test_scaled)
            metric_name = 'Silhouette Score'
        
        # Feature importance
        if hasattr(model, 'feature_importances_'):
            feature_importance = pd.DataFrame({
                'feature': X_processed.columns,
                'importance': model.feature_importances_
            }).sort_values('importance', ascending=False)
        else:
            feature_importance = None
        
        return {
            'model': model,
            'score': score,
            'metric_name': metric_name,
            'feature_importance': feature_importance,
            'predictions': predictions,
            'actual': y_test.values if model_type != 'clustering' else None
        }
    
    def create_visualizations(self, df: pd.DataFrame) -> list:
        """Create automatic visualizations"""
        charts = []
        
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df.select_dtypes(include=['object']).columns.tolist()
        
        # Correlation heatmap
        if len(numeric_cols) > 1:
            corr_matrix = df[numeric_cols].corr()
            fig = px.imshow(corr_matrix, 
                           title="📊 Correlation Heatmap",
                           color_continuous_scale='RdBu_r')
            charts.append(('correlation', fig))
        
        # Distribution plots for numeric columns
        for col in numeric_cols[:4]:  # Limit to first 4 columns
            fig = px.histogram(df, x=col, title=f"📈 Distribution of {col}")
            charts.append(('distribution', fig))
        
        # Value counts for categorical columns
        for col in categorical_cols[:3]:  # Limit to first 3 columns
            value_counts = df[col].value_counts().head(10)
            fig = px.bar(x=value_counts.index, y=value_counts.values, 
                        title=f"📊 Top Values in {col}")
            charts.append(('categorical', fig))
        
        # Scatter plots for numeric pairs
        if len(numeric_cols) >= 2:
            fig = px.scatter(df, x=numeric_cols[0], y=numeric_cols[1], 
                           title=f"🔍 {numeric_cols[0]} vs {numeric_cols[1]}")
            charts.append(('scatter', fig))
        
        return charts

def create_data_processor_interface():
    """Create Streamlit interface for data processor"""
    st.title("📊 Smart Data Processor")
    st.write("AI-powered data analysis with automatic insights and ML models")
    
    processor = SmartDataProcessor()
    
    # File upload
    uploaded_file = st.file_uploader("📁 Upload Dataset", type=['csv', 'xlsx', 'json'])
    
    if uploaded_file is not None:
        try:
            # Load data
            if uploaded_file.name.endswith('.csv'):
                df = pd.read_csv(uploaded_file)
            elif uploaded_file.name.endswith('.xlsx'):
                df = pd.read_excel(uploaded_file)
            elif uploaded_file.name.endswith('.json'):
                df = pd.read_json(uploaded_file)
            
            st.success(f"✅ Loaded dataset: {df.shape[0]} rows, {df.shape[1]} columns")
            
            # Tabs for different functions
            tab1, tab2, tab3, tab4, tab5 = st.tabs(["📋 Overview", "🧹 Clean Data", "📊 Visualizations", "🤖 ML Models", "💡 Insights"])
            
            with tab1:
                st.subheader("📋 Dataset Overview")
                
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Rows", f"{df.shape[0]:,}")
                with col2:
                    st.metric("Columns", df.shape[1])
                with col3:
                    st.metric("Memory (MB)", f"{df.memory_usage(deep=True).sum() / 1024**2:.2f}")
                
                # Data preview
                st.subheader("🔍 Data Preview")
                st.dataframe(df.head())
                
                # Column information
                st.subheader("📊 Column Information")
                col_info = pd.DataFrame({
                    'Column': df.columns,
                    'Type': df.dtypes.values,
                    'Missing': df.isnull().sum().values,
                    'Missing %': (df.isnull().sum() / len(df) * 100).round(2).values,
                    'Unique': [df[col].nunique() for col in df.columns]
                })
                st.dataframe(col_info)
            
            with tab2:
                st.subheader("🧹 Data Cleaning")
                
                if st.button("🔄 Auto Clean Data"):
                    with st.spinner("Cleaning data..."):
                        cleaned_df = processor.auto_clean_data(df)
                        st.session_state.cleaned_df = cleaned_df
                        st.success(f"✅ Data cleaned! Shape: {cleaned_df.shape}")
                        st.dataframe(cleaned_df.head())
                
                # Manual cleaning options
                st.subheader("🛠️ Manual Cleaning")
                
                col1, col2 = st.columns(2)
                
                with col1:
                    if st.button("Remove Duplicates"):
                        df_no_dup = df.drop_duplicates()
                        st.info(f"Removed {len(df) - len(df_no_dup)} duplicates")
                        st.session_state.processed_df = df_no_dup
                
                with col2:
                    missing_threshold = st.slider("Drop columns with missing % >", 0, 100, 50)
                    if st.button("Drop High Missing Columns"):
                        missing_pct = (df.isnull().sum() / len(df)) * 100
                        cols_to_drop = missing_pct[missing_pct > missing_threshold].index.tolist()
                        if cols_to_drop:
                            df_clean = df.drop(columns=cols_to_drop)
                            st.info(f"Dropped columns: {cols_to_drop}")
                            st.session_state.processed_df = df_clean
            
            with tab3:
                st.subheader("📊 Auto-Generated Visualizations")
                
                with st.spinner("Creating visualizations..."):
                    charts = processor.create_visualizations(df)
                
                for chart_type, fig in charts:
                    st.plotly_chart(fig, use_container_width=True)
            
            with tab4:
                st.subheader("🤖 Machine Learning Models")
                
                # Model configuration
                col1, col2 = st.columns(2)
                
                with col1:
                    target_column = st.selectbox("🎯 Target Column", df.columns.tolist())
                
                with col2:
                    model_type = st.selectbox("🔧 Model Type", 
                        ['classification', 'regression', 'clustering'])
                
                if st.button("🚀 Build Model"):
                    with st.spinner("Training model..."):
                        result = processor.build_ml_model(df, target_column, model_type)
                    
                    if 'error' not in result:
                        st.success(f"✅ Model trained successfully!")
                        st.metric(result['metric_name'], f"{result['score']:.4f}")
                        
                        # Feature importance
                        if result['feature_importance'] is not None:
                            st.subheader("📈 Feature Importance")
                            fig = px.bar(result['feature_importance'].head(10), 
                                       x='importance', y='feature', orientation='h',
                                       title="Top 10 Most Important Features")
                            st.plotly_chart(fig, use_container_width=True)
                        
                        # Predictions vs Actual (for supervised learning)
                        if result['actual'] is not None:
                            st.subheader("🎯 Predictions vs Actual")
                            comparison_df = pd.DataFrame({
                                'Actual': result['actual'],
                                'Predicted': result['predictions']
                            })
                            
                            if model_type == 'regression':
                                fig = px.scatter(comparison_df, x='Actual', y='Predicted',
                                               title="Predictions vs Actual Values")
                                fig.add_shape(type="line", x0=comparison_df['Actual'].min(), 
                                            x1=comparison_df['Actual'].max(),
                                            y0=comparison_df['Actual'].min(), 
                                            y1=comparison_df['Actual'].max())
                            else:
                                fig = px.histogram(comparison_df, title="Prediction Distribution")
                            
                            st.plotly_chart(fig, use_container_width=True)
                    
                    else:
                        st.error(result['error'])
            
            with tab5:
                st.subheader("💡 AI-Generated Insights")
                
                with st.spinner("Generating insights..."):
                    insights = processor.generate_insights(df)
                
                for insight in insights:
                    if insight['severity'] == 'warning':
                        st.warning(f"⚠️ {insight['message']}")
                    elif insight['severity'] == 'info':
                        st.info(f"ℹ️ {insight['message']}")
                    else:
                        st.success(f"✅ {insight['message']}")
                
                # Data quality score
                missing_score = 100 - (df.isnull().sum().sum() / (df.shape[0] * df.shape[1]) * 100)
                duplicate_score = 100 - (df.duplicated().sum() / len(df) * 100)
                overall_score = (missing_score + duplicate_score) / 2
                
                st.subheader("📊 Data Quality Score")
                col1, col2, col3 = st.columns(3)
                
                with col1:
                    st.metric("Completeness", f"{missing_score:.1f}%")
                with col2:
                    st.metric("Uniqueness", f"{duplicate_score:.1f}%")
                with col3:
                    st.metric("Overall Quality", f"{overall_score:.1f}%")
        
        except Exception as e:
            st.error(f"❌ Error loading file: {str(e)}")
    
    else:
        st.info("📁 Upload a dataset to start analysis")
        
        # Sample data option
        if st.button("📊 Use Sample Dataset"):
            # Create sample data
            np.random.seed(42)
            sample_df = pd.DataFrame({
                'sales': np.random.normal(1000, 200, 500),
                'marketing_spend': np.random.normal(50, 10, 500),
                'customer_satisfaction': np.random.uniform(1, 5, 500),
                'product_category': np.random.choice(['A', 'B', 'C'], 500),
                'region': np.random.choice(['North', 'South', 'East', 'West'], 500)
            })
            
            st.session_state.sample_data = sample_df
            st.success("✅ Sample dataset loaded!")
            st.dataframe(sample_df.head())

if __name__ == "__main__":
    create_data_processor_interface()

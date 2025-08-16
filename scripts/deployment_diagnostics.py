import os
import subprocess
import requests
import json
from datetime import datetime

class SuperMegaDeploymentDiagnostics:
    def __init__(self):
        self.issues = []
        self.solutions = []
        
    def check_github_pages_status(self):
        """Check GitHub Pages deployment status"""
        print("🔍 DIAGNOSING SUPERMEGA.DEV DEPLOYMENT ISSUES...")
        print("=" * 60)
        
        # Check DNS resolution
        try:
            import socket
            ip = socket.gethostbyname('supermega.dev')
            print(f"✅ DNS Resolution: supermega.dev → {ip}")
        except Exception as e:
            print(f"❌ DNS Resolution Failed: {e}")
            self.issues.append("DNS resolution failing")
        
        # Check HTTP response
        try:
            response = requests.get('https://supermega.dev', timeout=10)
            print(f"✅ HTTPS Response: {response.status_code}")
            if response.status_code == 200:
                # Check if content contains our latest updates
                if "AI Content Generator" in response.text:
                    print("✅ Latest content is live!")
                else:
                    print("❌ Old content still showing")
                    self.issues.append("GitHub Pages cache/update delay")
            else:
                print(f"❌ HTTP Error: {response.status_code}")
                self.issues.append(f"HTTP {response.status_code} error")
        except Exception as e:
            print(f"❌ HTTPS Request Failed: {e}")
            self.issues.append("Website not accessible")
        
        # Check git status
        result = subprocess.run(['git', 'log', '--oneline', '-1'], 
                               capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Latest Commit: {result.stdout.strip()}")
        
        # Check if we're on the right repository
        result = subprocess.run(['git', 'remote', 'get-url', 'origin'], 
                               capture_output=True, text=True)
        if result.returncode == 0:
            repo_url = result.stdout.strip()
            print(f"✅ Repository: {repo_url}")
            if "swanhtet01.github.io" not in repo_url:
                self.issues.append("Wrong repository for GitHub Pages")
        
        return self.issues
    
    def generate_solutions(self):
        """Generate solutions based on identified issues"""
        print("\n🛠️ RECOMMENDED SOLUTIONS:")
        print("=" * 60)
        
        if not self.issues:
            print("✅ No critical issues found. Likely caching delay.")
            self.solutions = ["Wait 5-10 minutes for GitHub Pages cache", 
                             "Force refresh browser (Ctrl+F5)"]
        else:
            if "DNS resolution failing" in self.issues:
                self.solutions.append("Check domain DNS settings")
                self.solutions.append("Verify CNAME file is correct")
            
            if "GitHub Pages cache/update delay" in self.issues:
                self.solutions.append("Force GitHub Pages rebuild")
                self.solutions.append("Clear CDN cache")
                self.solutions.append("Wait 5-10 minutes for propagation")
            
            if "Website not accessible" in self.issues:
                self.solutions.append("Check GitHub Pages settings")
                self.solutions.append("Consider alternative deployment (Netlify/Vercel)")
            
            if "Wrong repository for GitHub Pages" in self.issues:
                self.solutions.append("Ensure repository is named correctly for Pages")
        
        # Always include these as options
        self.solutions.extend([
            "Push empty commit to trigger rebuild",
            "Disable and re-enable GitHub Pages",
            "Switch to GitHub Actions deployment",
            "Use alternative hosting (Netlify, Vercel, Cloudflare Pages)"
        ])
        
        for i, solution in enumerate(self.solutions, 1):
            print(f"{i}. {solution}")
        
        return self.solutions
    
    def create_deployment_alternatives(self):
        """Create alternative deployment configurations"""
        print("\n🚀 CREATING ALTERNATIVE DEPLOYMENT OPTIONS...")
        print("=" * 60)
        
        # GitHub Actions deployment
        github_actions = """name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Pages
      uses: actions/configure-pages@v3
    
    - name: Upload artifact
      uses: actions/upload-pages-artifact@v2
      with:
        path: '.'
    
    - name: Deploy to GitHub Pages
      id: deployment
      uses: actions/deploy-pages@v2
"""
        
        os.makedirs('.github/workflows', exist_ok=True)
        with open('.github/workflows/deploy.yml', 'w') as f:
            f.write(github_actions)
        print("✅ Created GitHub Actions workflow")
        
        # Netlify deployment
        netlify_config = """[build]
  publish = "."
  command = "echo 'Static site ready'"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
"""
        
        with open('netlify.toml', 'w') as f:
            f.write(netlify_config)
        print("✅ Created Netlify configuration")
        
        # Vercel deployment  
        vercel_config = """{
  "version": 2,
  "builds": [
    {
      "src": "**/*",
      "use": "@vercel/static"
    }
  ]
}"""
        
        with open('vercel.json', 'w') as f:
            f.write(vercel_config)
        print("✅ Created Vercel configuration")
        
    def force_github_rebuild(self):
        """Force GitHub to rebuild the site"""
        print("\n🔄 FORCING GITHUB PAGES REBUILD...")
        print("=" * 60)
        
        # Create empty commit to trigger rebuild
        subprocess.run(['git', 'add', '.'], check=False)
        subprocess.run(['git', 'commit', '--allow-empty', '-m', 
                       f'🔄 Force rebuild supermega.dev - {datetime.now().strftime("%Y-%m-%d %H:%M")}'],
                      check=False)
        result = subprocess.run(['git', 'push'], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Empty commit pushed to force rebuild")
            print("⏳ Wait 2-5 minutes for GitHub Pages to update")
        else:
            print(f"❌ Push failed: {result.stderr}")
    
    def run_full_diagnosis(self):
        """Run complete diagnosis and provide solutions"""
        issues = self.check_github_pages_status()
        solutions = self.generate_solutions()
        self.create_deployment_alternatives()
        
        print(f"\n📊 DIAGNOSIS COMPLETE - {len(issues)} issues found")
        print(f"🎯 {len(solutions)} solutions available")
        
        return {
            'issues': issues,
            'solutions': solutions,
            'timestamp': datetime.now().isoformat()
        }

if __name__ == "__main__":
    diagnostics = SuperMegaDeploymentDiagnostics()
    result = diagnostics.run_full_diagnosis()
    
    # Automatically try the force rebuild
    diagnostics.force_github_rebuild()
    
    print(f"\n🌐 CHECK SUPERMEGA.DEV IN 2-5 MINUTES")
    print("If still not updated, try solutions above in order")

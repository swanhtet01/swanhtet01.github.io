# 🚀 Super Mega Meta API Setup Guide
## Facebook & Instagram Integration for Social AI Platform

### Prerequisites
Before running the Meta Auto Dev Team, you need to set up API access for your Facebook Page and Instagram Business account.

## Step 1: Facebook App Setup

### 1.1 Create Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **"Create App"**
3. Choose **"Business"** type
4. Fill in app details:
   - **App Name**: "Super Mega Social AI"
   - **App Contact Email**: Your email
   - **Business Account**: Select or create

### 1.2 Configure App Permissions
Add these products to your app:
- **Facebook Login** 
- **Marketing API**
- **Instagram Basic Display**
- **Instagram Marketing API**

Required permissions:
- `pages_manage_posts`
- `pages_read_engagement` 
- `instagram_basic`
- `instagram_content_publish`

### 1.3 Get Access Tokens
1. Go to **Tools > Graph API Explorer**
2. Select your app
3. Generate **Page Access Token**:
   - User Token → Page Token
   - Select your Super Mega page
   - Generate token with required permissions

## Step 2: Instagram Business Setup

### 2.1 Convert to Business Account
1. Open Instagram app
2. Go to **Settings → Account**
3. Switch to **Professional Account**
4. Choose **Business**
5. Connect to your Facebook Page

### 2.2 Get Instagram Account ID
1. Use Graph API Explorer
2. Call: `me/accounts` (with your page token)
3. Find your page, then call: `{page-id}?fields=instagram_business_account`
4. Copy the Instagram Business Account ID

## Step 3: Configure Environment

### 3.1 Update .env.meta File
```env
# Facebook Settings
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here  
FACEBOOK_ACCESS_TOKEN=your_long_lived_page_token_here
FACEBOOK_PAGE_ID=your_facebook_page_id_here

# Instagram Settings
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token_here
INSTAGRAM_ACCOUNT_ID=your_instagram_business_account_id_here

# Super Mega Branding
COMPANY_NAME=Super Mega Inc
WEBSITE_URL=https://swanhtet01.github.io
```

### 3.2 Test Configuration
Run the test script:
```bash
python test_meta_config.py
```

## Step 4: Content Strategy Setup

### 4.1 Define Target Audience
Update in `.env.meta`:
```env
TARGET_AUDIENCE=Small to medium businesses seeking AI automation
KEY_VALUE_PROPOSITION=AI-powered social media management that actually works
BRAND_VOICE=Professional, innovative, results-driven
```

### 4.2 Set Posting Schedule
```env
FACEBOOK_POSTS_PER_DAY=3
INSTAGRAM_POSTS_PER_DAY=2
OPTIMAL_FB_TIMES=09:00,13:00,17:00
OPTIMAL_IG_TIMES=11:00,15:00
```

## Step 5: Launch Auto Dev Team

### 5.1 Start the System
```bash
START_META_AUTO_DEV.bat
```

### 5.2 Monitor Performance
- **Logs**: `meta_auto_dev.log`
- **Analytics**: `meta_performance_report.json`
- **Database**: `meta_analytics.db`

## Safety & Compliance

### Content Review Process
1. **Auto-generation**: AI creates content drafts
2. **Queue review**: Content goes to approval queue
3. **Manual approval**: Review before posting (optional)
4. **Scheduled posting**: Content posts at optimal times
5. **Performance tracking**: Monitor engagement and adjust

### API Rate Limits
- **Facebook**: 200 calls per hour per user
- **Instagram**: 240 calls per hour per user
- **Auto-throttling**: System respects all limits

### Content Guidelines
- No political content
- Focus on business value
- Professional tone
- Hashtag compliance
- Image/video requirements met

## Troubleshooting

### Common Issues

**"Invalid Access Token"**
- Token may have expired
- Regenerate long-lived token
- Check app permissions

**"Page Not Found"**  
- Verify Page ID is correct
- Ensure page is connected to app
- Check page roles and permissions

**"Instagram API Error"**
- Ensure Instagram is Business account
- Verify connection to Facebook Page
- Check Instagram account ID

**Content Not Posting**
- Check posting permissions
- Verify content meets platform guidelines
- Review API error logs

### Get Help
- Check logs in `meta_auto_dev.log`
- Review Facebook Developer Console
- Test API calls in Graph API Explorer
- Contact support if needed

## Advanced Features

### Custom Content Templates
Edit `meta_auto_dev_team.py` to add:
- Industry-specific templates
- Seasonal content
- Campaign-specific messaging
- A/B testing variants

### Analytics Integration
- Connect Google Analytics
- Set up Facebook Pixel
- Track conversion metrics
- ROI measurement

### Automation Rules
- Auto-pause low-performing content
- Boost high-engagement posts
- Adjust posting times based on performance
- Content optimization suggestions

---

🎯 **Goal**: Automate Super Mega's social media presence to attract clients for the Social AI platform while maintaining high-quality, engaging content that converts viewers into customers.

📈 **Expected Results**: 
- Increased brand awareness
- More website traffic
- Higher conversion rates  
- Reduced manual social media work
- Better client acquisition for AI services

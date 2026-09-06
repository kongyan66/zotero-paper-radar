from paper import ArxivPaper
import html
import math
from tqdm import tqdm
from email.header import Header
from email.mime.text import MIMEText
from email.utils import parseaddr, formataddr
import smtplib
import ssl
import datetime
import time
from loguru import logger

framework = """
<!DOCTYPE HTML>
<html>
<head>
  <style>
    .star-wrapper {
      font-size: 1.3em; /* 调整星星大小 */
      line-height: 1; /* 确保垂直对齐 */
      display: inline-flex;
      align-items: center; /* 保持对齐 */
    }
    .half-star {
      display: inline-block;
      width: 0.5em; /* 半颗星的宽度 */
      overflow: hidden;
      white-space: nowrap;
      vertical-align: middle;
    }
    .full-star {
      vertical-align: middle;
    }
  </style>
</head>
<body>

<div>
    __CONTENT__
</div>

<br><br>
<div>
To unsubscribe, remove your email in your Github Action setting.
</div>

</body>
</html>
"""

def get_empty_html():
  block_template = """
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: Arial, sans-serif; border: 1px solid #ddd; border-radius: 8px; padding: 16px; background-color: #f9f9f9;">
  <tr>
    <td style="font-size: 20px; font-weight: bold; color: #333;">
        No Papers Today. Take a Rest!
    </td>
  </tr>
  </table>
  """
  return block_template

def get_block_html(title:str, authors:str, rate:str,arxiv_id:str, abstract:str, pdf_url:str, code_url:str=None, affiliations:str=None, reason:str=None):
    code = f'<a href="{code_url}" style="display: inline-block; text-decoration: none; font-size: 14px; font-weight: bold; color: #fff; background-color: #5bc0de; padding: 8px 16px; border-radius: 4px; margin-left: 8px;">Code</a>' if code_url else ''
    block_template = """
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: Arial, sans-serif; border: 1px solid #ddd; border-radius: 8px; padding: 16px; background-color: #f9f9f9;">
    <tr>
        <td style="font-size: 20px; font-weight: bold; color: #333;">
            {title}
        </td>
    </tr>
    <tr>
        <td style="font-size: 14px; color: #666; padding: 8px 0;">
            {authors}
            <br>
            <i>{affiliations}</i>
        </td>
    </tr>
    <tr>
        <td style="font-size: 14px; color: #333; padding: 8px 0;">
            <strong>Relevance:</strong> {rate}
        </td>
    </tr>
    <tr>
        <td style="font-size: 14px; color: #333; padding: 8px 0;">
            <strong>arXiv ID:</strong> <a href="https://arxiv.org/abs/{arxiv_id}" target="_blank">{arxiv_id}</a>
        </td>
    </tr>
    <tr>
        <td style="font-size: 14px; color: #333; padding: 8px 0;">
            <strong>TLDR:</strong> {abstract}
        </td>
    </tr>
    {reason}

    <tr>
        <td style="padding: 8px 0;">
            <a href="{pdf_url}" style="display: inline-block; text-decoration: none; font-size: 14px; font-weight: bold; color: #fff; background-color: #d9534f; padding: 8px 16px; border-radius: 4px;">PDF</a>
            {code}
        </td>
    </tr>
</table>
"""
    return block_template.format(title=title, authors=authors,rate=rate,arxiv_id=arxiv_id, abstract=abstract, pdf_url=pdf_url, code=code, affiliations=affiliations, reason=reason or "")


def _profile_items_html(profiles:list) -> str:
    items = []
    for profile in profiles[:3]:
        keywords = ", ".join(html.escape(keyword) for keyword in profile.keywords[:5])
        representatives = "; ".join(html.escape(title) for title in profile.representative_titles[:2])
        confidence = getattr(profile, "confidence", None)
        member_count = getattr(profile, "member_count", len(getattr(profile, "member_indices", [])))
        confidence_line = ""
        if confidence is not None:
            confidence_line = (
                f"<br><span style=\"color: #777;\">Profile cohesion: {confidence:.0%}; "
                f"Zotero papers: {member_count}</span>"
            )
        items.append(
            "<li style=\"margin-bottom: 8px;\">"
            f"<strong>{html.escape(profile.name)}</strong>"
            f"<br><span style=\"color: #666;\">Keywords: {keywords}</span>"
            f"<br><span style=\"color: #666;\">Representative Zotero papers: {representatives}</span>"
            f"{confidence_line}"
            "</li>"
        )
    return "".join(items)


def get_profile_group_html(title:str, profiles:list) -> str:
    if not profiles:
        return ""
    return f"""
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: Arial, sans-serif; border: 1px solid #ddd; border-radius: 8px; padding: 16px; background-color: #fffdf5;">
    <tr>
        <td style="font-size: 18px; font-weight: bold; color: #333;">
            {html.escape(title)}
        </td>
    </tr>
    <tr>
        <td style="font-size: 14px; color: #333; padding-top: 8px;">
            <ul style="margin: 6px 0 0 18px; padding: 0;">
                {_profile_items_html(profiles)}
            </ul>
        </td>
    </tr>
    </table>
    <br>
"""


def get_profiles_html(profiles:list) -> str:
    return get_profile_group_html("Your Interest Profiles", profiles)


def get_reason_html(paper:ArxivPaper) -> str:
    if not paper.matched_profile and not paper.matched_corpus:
        return ""
    profile = html.escape(paper.matched_profile or "Unknown profile")
    keywords = ", ".join(html.escape(keyword) for keyword in paper.matched_keywords[:6])
    keyword_line = f"<br><strong>Keywords:</strong> {keywords}" if keywords else ""
    confidence = getattr(paper, "matched_profile_confidence", None)
    member_count = getattr(paper, "matched_profile_member_count", 0)
    confidence_line = ""
    if confidence is not None:
        confidence_line = (
            f"<br><strong>Profile cohesion:</strong> {confidence:.0%}"
            f"{f' from {member_count} Zotero papers' if member_count else ''}."
        )
    recent_profile = getattr(paper, "recent_matched_profile", None)
    long_term_profile = getattr(paper, "long_term_matched_profile", None)
    recent_score = getattr(paper, "recent_matched_score", 0.0)
    long_term_score = getattr(paper, "long_term_matched_score", 0.0)
    time_scope_line = ""
    if recent_profile or long_term_profile:
        parts = []
        if recent_profile:
            parts.append(f"Recent: {html.escape(recent_profile)} ({recent_score:.2f})")
        if long_term_profile:
            parts.append(f"Long-term: {html.escape(long_term_profile)} ({long_term_score:.2f})")
        time_scope_line = f"<br><strong>Interest match:</strong> {'; '.join(parts)}"
    matched_items = []
    for matched in paper.matched_corpus[:3]:
        paths = ", ".join(matched.paths[:2]) if matched.paths else "No collection"
        matched_items.append(
            "<li>"
            f"{html.escape(matched.title)} "
            f"(similarity {matched.similarity:.2f}; {html.escape(paths)})"
            "</li>"
        )
    matched_list = f"<ul style=\"margin: 6px 0 0 18px; padding: 0;\">{''.join(matched_items)}</ul>" if matched_items else ""
    return f"""
    <tr>
        <td style="font-size: 14px; color: #333; padding: 8px 0;">
            <strong>Why recommended:</strong> This paper is close to your <i>{profile}</i> profile.
            {confidence_line}
            {time_scope_line}
            {keyword_line}
            {matched_list}
        </td>
    </tr>
"""

def get_stars(score:float):
    full_star = '<span class="full-star">⭐</span>'
    half_star = '<span class="half-star">⭐</span>'
    low = 6
    high = 8
    if score <= low:
        return ''
    elif score >= high:
        return full_star * 5
    else:
        interval = (high-low) / 10
        star_num = math.ceil((score-low) / interval)
        full_star_num = int(star_num/2)
        half_star_num = star_num - full_star_num * 2
        return '<div class="star-wrapper">'+full_star * full_star_num + half_star * half_star_num + '</div>'


def render_email(papers:list[ArxivPaper]):
    parts = []
    if len(papers) == 0 :
        return framework.replace('__CONTENT__', get_empty_html())
    recent_profiles = getattr(papers[0], "recent_interest_profiles", [])
    long_term_profiles = getattr(papers[0], "long_term_interest_profiles", [])
    if recent_profiles:
        parts.append(get_profile_group_html("Your Recent Interest Profiles", recent_profiles))
    if long_term_profiles:
        parts.append(get_profile_group_html("Your Long-term Interest Profiles", long_term_profiles))
    if not recent_profiles and not long_term_profiles:
        parts.append(get_profiles_html(getattr(papers[0], "interest_profiles", [])))
    
    for p in tqdm(papers,desc='Rendering Email'):
        rate = get_stars(p.score or 0.0)
        author_list = [a.name for a in p.authors]
        num_authors = len(author_list)
        
        if num_authors <= 5:
            authors = ', '.join(author_list)
        else:
            authors = ', '.join(author_list[:3] + ['...'] + author_list[-2:])
        if p.affiliations is not None:
            affiliations = p.affiliations[:5]
            affiliations = ', '.join(affiliations)
            if len(p.affiliations) > 5:
                affiliations += ', ...'
        else:
            affiliations = 'Unknown Affiliation'
        parts.append(
            get_block_html(
                html.escape(p.title),
                html.escape(authors),
                rate,
                html.escape(p.arxiv_id),
                html.escape(p.tldr),
                html.escape(p.pdf_url, quote=True),
                html.escape(p.code_url, quote=True) if p.code_url else None,
                html.escape(affiliations),
                get_reason_html(p),
            )
        )
        time.sleep(10)

    content = '<br>' + '</br><br>'.join(parts) + '</br>'
    return framework.replace('__CONTENT__', content)

def send_email(sender:str, receiver:str, password:str,smtp_server:str,smtp_port:int, html:str,):
    def _format_addr(s):
        name, addr = parseaddr(s)
        return formataddr((Header(name, 'utf-8').encode(), addr))

    msg = MIMEText(html, 'html', 'utf-8')
    msg['From'] = _format_addr('Github Action <%s>' % sender)
    msg['To'] = _format_addr('You <%s>' % receiver)
    today = datetime.datetime.now().strftime('%Y/%m/%d')
    msg['Subject'] = Header(f'Daily arXiv {today}', 'utf-8').encode()

    smtp_port = int(smtp_port)
    context = ssl.create_default_context()
    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port, context=context)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls(context=context)
    except Exception as e:
        logger.warning(f"Failed to use configured SMTP mode. {e}")
        logger.warning(f"Try to use SSL.")
        server = smtplib.SMTP_SSL(smtp_server, smtp_port, context=context)

    server.login(sender, password)
    server.sendmail(sender, [receiver], msg.as_string())
    server.quit()

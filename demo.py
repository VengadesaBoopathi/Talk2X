import yt_dlp

video_url = "https://www.youtube.com/watch?v=Cyp5aiIiVm5lRdrA"

ydl_opts = {
    "skip_download": True,
    "writesubtitles": True,
    "writeautomaticsub": True,
    "subtitleslangs": ["en"],
    "quiet": True,
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info = ydl.extract_info(video_url, download=False)
    print(info.get("automatic_captions", {}).keys())
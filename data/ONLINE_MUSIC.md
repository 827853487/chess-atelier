# 可选在线古典乐目录

`online-music.js` 为纯静态网站提供可选、无密钥的 Wikimedia Commons 录音发现。它不创建音频元素、不控制播放，也不要求访问者登录。默认本地精选与三首预载仍由播放器处理；在线目录用于扩大选择，不承诺每个文件都有商业唱片级音质或准确完整的编目。

## 已实现的接口

`discoverMusic(era)` 返回 Promise，结果 `{tracks, hasMore, message?}`。时期为 `all/baroque/classical/romantic/modern`；all 在四个时期之间轮换。一次调用最多读取一页，页面为空或筛选后无合格条目时不自动连发请求。作曲家分类用尽后换到下一位，一轮作曲家目录读完时 `hasMore=false`，以后显式调用可以再次轮巡以发现新增录音。

每条曲目包含 `id,file,title,composer,performer,era,sourceUrl,license,licenseUrl,credit,remoteUrl,online,bytes,mime`。id 为 `commons:` 加真实文件名；remoteUrl 来自 imageinfo 的本站上传文件 URL，sourceUrl 优先使用 API 的文件说明页。performer 使用 Artist 元数据作为署名线索，该字段可能混合作曲、演奏或上传角色，确切演奏者仍以来源页为准；缺失时明确提示查看来源页。所有显示字段剥离 HTML，供调用者以 textContent 使用。

## Commons 查询与边界

使用 `https://commons.wikimedia.org/w/api.php`：

```text
action=query
format=json
formatversion=2
origin=*
generator=categorymembers
gcmtitle=Category:Audio files of music by <作曲家>
gcmtype=file
gcmlimit=35
prop=imageinfo
iiprop=url|size|mime|mediatype|metadata|extmetadata
```

响应中的 continue 与 gcmcontinue 等续页字段原样保存到该时期的游标，下一次按原值发送。元数据请求全局串行，至少间隔约 900 ms；同一时期或同一轮 all 的并发调用复用正在进行的 Promise。单次网络超时约 12 秒，429/503 尊重 Retry-After 的合理秒数并退避，不无限重试。浏览器以 credentials:omit 发送，并提供 Api-User-Agent 标识。

接受 MP3/OGG/OGA/WAV/FLAC/OPUS/音频 WEBM，要求真实音频 MIME 或非视频的 application/ogg，大小约 200 KB–30 MiB；排除文件名明确标注样本、片段、口述、MIDI 等内容。若原始元数据提供时长，还排除短于35秒的文件。播放器仍应通过 canPlayType 检查当前浏览器的解码支持；特别是不同 iOS 版本对容器/编码的支持不同。bytes 也供播放器决定大文件直接流播、小文件完整缓存。

许可只接受明确 CC0、Public domain、CC BY、CC BY-SA 或带明确许可地址的 BSD；拒绝 NC、ND、fair use 和不明条款。保留演奏者、署名、许可与来源页，不以作品古老来推断现代录音自由。分类可能混入集锦、改编或无关录音，因此还要求文件名/作品名/说明/作者字段出现对应作曲家或特定作品族证据。即便经过过滤，也不将开放分类库等同于已逐一人工审听的精选唱片库。

元数据缓存仅存本地 localStorage，每时期最多60条，四时期合计最多240条，约14天失效；不在此模块缓存音频大文件。缓存受损、空间不足或存储被禁用时正常降级。网络失败可返回该时期已缓存元信息，调用方按稳定 ID 去重；返回非空数组不代表本次联网成功，可将 message 用于内部状态，不将失败当作已有在线资源全部失效。

### 一手参考与实测

- [Commons API](https://commons.wikimedia.org/wiki/Commons:API)：文件许可取决于各文件说明页，不能用网站统一许可替代录音许可。
- [MediaWiki CORS](https://www.mediawiki.org/wiki/API:Cross-site_requests)：匿名 origin=* 请求。研究时从 GitHub Pages Origin 实测 API 返回200及 Access-Control-Allow-Origin:*。
- [Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo)：文件 URL、大小、MIME 与扩展元数据。
- [Categorymembers](https://www.mediawiki.org/wiki/API:Categorymembers)、[Continuation](https://www.mediawiki.org/wiki/API:Continue)：类别与原样续页。
- [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette)：识别客户端、串行、批量与缓存、退避。

跨源允许与网络可达性是两回事：访客地区、运营商、上游限流及录音可用性仍可能影响播放。Wikimedia 的音频 URL 为 HTTPS，正常 HTML audio 可以流播；读取成 Blob、Web Audio 或其他受 CORS 限制的操作仍须检查实际媒体响应。不要用 JSONP 绕开错误，也不要为了批量发现预载整库音频。

## 其他开放库的适用范围

| 来源 | 能提供什么 | 本项目可行用法与限制 |
| --- | --- | --- |
| [Internet Archive Musopen Collection](https://archive.org/details/musopen) | 可播放的历史 Musopen 录音项目，部分有无损与压缩副本、多个乐章 | 查询 `advancedsearch.php?q=collection:musopen AND mediatype:audio&output=json`，再读 `metadata/{identifier}` 的 files、licenseurl；研究时返回34个项目，不等于34首单曲，更不是无限大目录。元数据和搜索实测支持 CORS:*；每个项目和录音仍需单独核对许可、重复版本与格式。 |
| [Musopen](https://musopen.org/music/) | 按作曲家、演奏者、时期等浏览的录音及乐谱 | 官方[FAQ](https://musopen.org/faq/)说明上传者须作公版声明，但网站不保证每项内容都经权利审查；下载/无损可能涉及会员。未发现可依赖的、面向此静态播放器的官方匿名录音 API，不抓取绕过访问要求。可人工挑选并核对许可后纳入本地精选。 |
| [IMSLP API](https://imslp.org/wiki/IMSLP:API) | 官方公开列表 API 主要列作曲家/人员和作品，可用 start 分页 | IMSLP 有录音页面，但上述 API 不是无条件可热链的完整音频服务。适合查作品和人工选录音，需核对作品与录音双重版权及访问流程，见[官方版权说明](https://imslp.org/wiki/IMSLP:Copyright_Made_Simple)。 |
| [Open Opus](https://openopus.org/) | 免费无注册、开放的作曲家和作品元数据 | 官网 FAQ 明确当前不提供录音数据；不能把它当作可播放音频源。可以帮助整理时期、作品名与目录，不会自动获得 Spotify 等服务的流播权限。 |

Internet Archive 参考：[Item Metadata API](https://archive.org/developers/md-read.html)。长期扩充优先维护“人工核对的本地精选 + 后台自动连接的分页在线目录”，把质量、网络、许可和缓存边界清楚区分。

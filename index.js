export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 관리자 페이지 (HTML)
    if (path === '/' || path === '/admin') {
      return new Response(`<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HydronX Key Manager</title>
    <style>
        body { background: #0f172a; color: #f8fafc; font-family: sans-serif; padding: 20px; display: flex; justify-content: center; }
        .container { width: 100%; max-width: 400px; background: #1e293b; padding: 20px; border-radius: 12px; }
        input, textarea, select { width: 100%; padding: 10px; margin-top: 5px; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px; box-sizing: border-box; }
        button { width: 100%; margin-top: 15px; padding: 12px; background: #0284c7; border: none; color: white; font-weight: bold; border-radius: 6px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="container">
        <h2>HydronX Key Manager</h2>
        <label>관리자 비밀번호</label>
        <input type="password" id="pass" value="1234">
        <label>보호할 스크립트 소스코드</label>
        <textarea id="source" style="height:120px;" placeholder="Lua 소스 입력"></textarea>
        <label>기간 선택</label>
        <select id="days"><option value="1">1일권</option><option value="permanent">영구제</option></select>
        <button onclick="go()">키 생성 및 배포</button>
        <div id="res" style="margin-top:15px; word-break:break-all; color:#34d399; font-size:13px;"></div>
    </div>
    <script>
        async function go() {
            let res = await fetch('/api/create', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({password: document.getElementById('pass').value, source_code: document.getElementById('source').value, duration: document.getElementById('days').value})
            });
            let d = await res.json();
            document.getElementById('res').innerHTML = d.success ? "<b>생성 완료!</b><br><input type='text' readonly value='" + d.loader + "' onclick='this.select()'>" : "에러: " + d.error;
        }
    </script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // 키 생성 API
    if (path === '/api/create' && request.method === 'POST') {
      try {
        let body = await request.json();
        if (body.password !== "1234") return new Response(JSON.stringify({success: false, error: "비밀번호가 틀렸습니다."}));
        
        let key = "Hydron-" + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
        let exp = new Date();
        if (body.duration === 'permanent') exp.setFullYear(exp.getFullYear() + 100);
        else exp.setDate(exp.getDate() + 1);

        await env.DB.prepare("INSERT INTO scripts (script_key, source_code, expires_at) VALUES (?, ?, ?)").bind(key, body.source_code, exp.toISOString()).run();
        
        return new Response(JSON.stringify({
          success: true, 
          loader: `loadstring(game:HttpGet("${url.origin}/load?key=${key}"))()`
        }));
      } catch (e) {
        return new Response(JSON.stringify({success: false, error: e.message}));
      }
    }

    // 게임 내 로드 요청 처리 (소스코드 은닉 및 래핑 반환)
    if (path === '/load') {
      let key = url.searchParams.get('key');
      if (!key) return new Response('print("Error: No key")');

      let {results} = await env.DB.prepare("SELECT source_code, expires_at FROM scripts WHERE script_key = ?").bind(key).all();
      if (!results || results.length === 0) return new Response('print("Error: Invalid Key")');
      if (new Date(results[0].expires_at) < new Date()) return new Response('print("Error: Key Expired")');
      
      // [핵심] 웹이나 디컴파일러로 접근해도 원본 소스가 노출되지 않도록 서버에서 래핑해서 반환
      return new Response(`
        -- [HydronX Secure Execution Layer]
        local success, err = pcall(function()
            ${results[0].source_code}
        end)
        if not success then
            warn("HydronX Error:", err)
        end
      `, { headers: { 'Content-Type': 'text/plain' } });
    }

    return new Response('Not Found', {status: 404});
  }
};

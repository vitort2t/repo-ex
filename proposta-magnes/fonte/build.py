"""Builds proposta.html (A4, 9 pages) for MAGNES."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))

ILL = '<div class="ill">Imagem ilustrativa — layout de demonstração</div>'
ILL_D = '<div class="ill dark">Imagem ilustrativa — layout de demonstração</div>'

# ---------------- icons (simple line icons) ----------------
def ic(name, size=16, color="currentColor", sw=1.8):
    p = {
        "cart": '<path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
        "search": '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
        "menu": '<path d="M4 7h16M4 12h16M4 17h10"/>',
        "chat": '<path d="M4 18.5V6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H8.2L4 18.5z"/><path d="M8.5 9h7M8.5 12h4.5"/>',
        "truck": '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>',
        "store": '<path d="M4 9.5V20h16V9.5M3 9.5l2-5h14l2 5c0 1.4-1.1 2.5-2.5 2.5S16 10.9 16 9.5c0 1.4-1.1 2.5-2.5 2.5S11 10.9 11 9.5c0 1.4-1.1 2.5-2.5 2.5S6 10.9 6 9.5c0 1.4-1.1 2.5-2.5 2.5"/><path d="M10 20v-5h4v5"/>',
        "grid": '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
        "bag": '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
        "heart": '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
        "save": '<path d="M6 4h12v16l-6-4-6 4z"/>',
        "device": '<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/>',
        "devices": '<rect x="2.5" y="5" width="13" height="9" rx="1.2"/><path d="M1.5 17h15"/><rect x="17" y="8" width="5.5" height="10" rx="1.2"/>',
        "home": '<path d="M4 11l8-6.5 8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
        "photo": '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
        "touch": '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.5 15.5a1.6 1.6 0 0 1 2.3-2.2L9 15"/>',
        "plan": '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8.5 12h7M8.5 15.5h7"/>',
        "pen": '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
        "code": '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 5l-3 14"/>',
        "list": '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.1"/><circle cx="4.8" cy="12" r="1.1"/><circle cx="4.8" cy="17.5" r="1.1"/>',
        "tag": '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.4"/>',
        "form": '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
        "check": '<path d="M4.5 12.5l4.5 4.5L19.5 7"/>',
        "test": '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
        "rocket": '<path d="M12 15l-3-3c1.5-4.5 4.5-7.5 10-8-.5 5.5-3.5 8.5-8 10z"/><path d="M9 12l-3.5.5L4 15.5l4 .5M12 15l-.5 3.5-3 1.5-.5-4"/><circle cx="14.5" cy="9.5" r="1.4"/>',
        "refresh": '<path d="M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12A7.5 7.5 0 0 1 17.9 7.4"/><path d="M18.5 3.5v4h-4M5.5 20.5v-4h4"/>',
        "swap": '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
        "shield": '<path d="M12 3.5l7 2.8v5.3c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
        "help": '<circle cx="12" cy="12" r="8"/><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.9-2.2 3.4M12 17v.2"/>',
        "clock": '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
        "card": '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
        "x": '<path d="M7 7l10 10M17 7L7 17"/>',
        "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
        "send": '<path d="M4 12l16-7-6 16-2.5-6.5z"/><path d="M11.5 14.5L20 5"/>',
        "pin": '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
        "user": '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
        "back": '<path d="M15 5l-7 7 7 7"/>',
        "mic": '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21"/>',
        "mail": '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
        "insta": '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6"/>',
        "phone": '<path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
    }[name]
    return f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{p}</svg>'

# ---------------- Sabor da Casa mockup screens ----------------
PRODUCTS = {
    "brigadeiro": ("Brigadeiro gourmet", "Chocolate belga e granulado", "3,50"),
    "bolochocolate": ("Bolo de chocolate", "Fatia com ganache", "12,00"),
    "tortalimao": ("Torta de limão", "Merengue maçaricado", "14,00"),
    "coxinha": ("Coxinha de frango", "Massa leve e crocante", "6,00"),
    "paodequeijo": ("Pão de queijo", "Porção com 6 unidades", "10,00"),
    "bolocenoura": ("Bolo de cenoura", "Cobertura de chocolate", "11,00"),
    "brownie": ("Brownie", "Casquinha crocante", "8,00"),
    "bolopote": ("Bolo de pote", "Chocolate com creme", "13,00"),
    "cookie": ("Cookie artesanal", "Gotas de chocolate", "7,00"),
    "empada": ("Empada de frango", "Massa amanteigada", "7,50"),
}

def statusbar(dark=False):
    c = "#fff" if dark else "#2b1d14"
    return (f'<div class="sb" style="color:{c}"><span>9:41</span><span class="sbr">'
            f'<i class="sig"></i><i class="wifi"></i><i class="bat"></i></span></div>')

def topbar(title=None, back=False, cart=2):
    left = (f'<span class="tb-ic">{ic("back",16)}</span>' if back else f'<span class="tb-ic">{ic("menu",16)}</span>')
    mid = (f'<span class="tb-title">{title}</span>' if title else '<span class="sdc-logo">Sabor <em>da</em> Casa</span>')
    badge = f'<b class="badge">{cart}</b>' if cart else ''
    return f'<div class="tb">{left}{mid}<span class="tb-ic rel">{ic("bag",17)}{badge}</span></div>'

def chips(active="Todos", items=("Todos", "Doces", "Salgados", "Bolos", "Tortas")):
    return '<div class="chips">' + "".join(f'<span class="chip{" on" if i==active else ""}">{i}</span>' for i in items) + '</div>'

def pcard(key, added=False):
    n, d, p = PRODUCTS[key]
    btn = '<span class="addb on">✓ No carrinho</span>' if added else '<span class="addb">+ Adicionar</span>'
    return (f'<div class="pc"><div class="pc-img"><img src="food/{key}.jpg"></div>'
            f'<div class="pc-b"><div class="pc-n">{n}</div><div class="pc-d">{d}</div>'
            f'<div class="pc-f"><span class="pc-p">R$ {p}</span>{btn}</div></div></div>')

def screen_home():
    return (statusbar() + topbar() +
            '<div class="sc-pad">'
            '<div class="hero"><img src="food/hero.jpg"><div class="hero-ov">'
            '<span class="hero-k">Feito em casa</span><div class="hero-t">Sabores que<br>abraçam.</div>'
            '<span class="btn-s">Ver cardápio</span></div></div>'
            '<div class="sec-h"><span>Categorias</span><a>ver todas</a></div>'
            '<div class="cats">'
            + "".join(f'<div class="cat"><div class="cat-i"><img src="food/{k}.jpg"></div><span>{n}</span></div>'
                      for k, n in [("brigadeiro", "Doces"), ("coxinha", "Salgados"), ("bolochocolate", "Bolos"), ("tortalimao", "Tortas")]) +
            '</div><div class="sec-h"><span>Mais pedidos</span><a>ver todos</a></div>'
            '<div class="grid2">' + pcard("brigadeiro") + pcard("bolocenoura") + '</div>'
            '</div>' + navbar(0))

def navbar(active=0):
    items = [("home", "Início"), ("grid", "Cardápio"), ("bag", "Carrinho"), ("chat", "Contato")]
    return '<div class="nav">' + "".join(
        f'<span class="nv{" on" if i==active else ""}">{ic(k,15)}<em>{t}</em></span>' for i, (k, t) in enumerate(items)) + '</div>'

def screen_catalog():
    return (statusbar() + topbar("Cardápio") +
            '<div class="sc-pad">'
            f'<div class="search">{ic("search",13,"#9a8576")}<span>Buscar no cardápio</span></div>'
            + chips("Doces") +
            '<div class="grid2">' + pcard("brigadeiro", True) + pcard("brownie") + pcard("tortalimao") + pcard("bolopote", True) + pcard("cookie") + pcard("bolochocolate") + '</div>'
            '</div>' + navbar(1))

def screen_categories():
    tiles = [("brigadeiro", "Doces", "12 itens"), ("coxinha", "Salgados", "9 itens"), ("bolochocolate", "Bolos", "6 itens"),
             ("tortalimao", "Tortas", "4 itens"), ("bolopote", "Bolos de pote", "5 itens"), ("paodequeijo", "Para o café", "7 itens")]
    return (statusbar() + topbar("Categorias") +
            '<div class="sc-pad"><div class="cat-intro">O que vai ser hoje?</div><div class="tiles">' +
            "".join(f'<div class="tile{" on" if i==1 else ""}"><img src="food/{k}.jpg"><div class="tile-l"><b>{n}</b><span>{c}</span></div></div>'
                    for i, (k, n, c) in enumerate(tiles)) +
            '</div></div>' + navbar(1))

def cart_item(key, q):
    n, d, p = PRODUCTS[key]
    v = float(p.replace(",", ".")) * q
    vs = f"{v:.2f}".replace(".", ",")
    return (f'<div class="ci"><div class="ci-img"><img src="food/{key}.jpg"></div><div class="ci-b"><div class="ci-n">{n}</div>'
            f'<div class="ci-d">R$ {p} / un.</div><div class="ci-f"><span class="qty"><i>−</i><b>{q}</b><i>+</i></span><span class="ci-p">R$ {vs}</span></div></div></div>')

def screen_cart():
    return (statusbar() + topbar("Meu carrinho", back=True, cart=4) +
            '<div class="sc-pad">'
            + cart_item("brigadeiro", 12) + cart_item("bolopote", 2) + cart_item("coxinha", 6) + cart_item("bolocenoura", 1) +
            '<div class="sum"><div><span>Subtotal (4 itens)</span><span>R$ 115,00</span></div>'
            '<div class="muted"><span>Entrega ou retirada</span><span>na próxima etapa</span></div>'
            '<div class="tot"><span>Total</span><span>R$ 115,00</span></div></div>'
            '<div class="btn-p">Continuar pedido</div>'
            f'<div class="saved">{ic("save",11,"#8b6a52")} Carrinho guardado neste aparelho</div>'
            '</div>')

def screen_checkout():
    return (statusbar() + topbar("Finalizar pedido", back=True, cart=4) +
            '<div class="sc-pad">'
            '<div class="lbl">Como prefere receber?</div>'
            f'<div class="seg"><span class="on">{ic("truck",14)} Entrega</span><span>{ic("store",14)} Retirada</span></div>'
            '<div class="lbl">Seus dados</div>'
            f'<div class="field">{ic("user",12,"#a08b7c")}<span>Nome completo</span></div>'
            f'<div class="field">{ic("pin",12,"#a08b7c")}<span>Endereço de entrega</span></div>'
            '<div class="field tall"><span>Observações (opcional)</span></div>'
            '<div class="lbl">Resumo</div>'
            '<div class="sum compact"><div><span>12× Brigadeiro gourmet</span><span>R$ 42,00</span></div>'
            '<div><span>2× Bolo de pote</span><span>R$ 26,00</span></div>'
            '<div><span>6× Coxinha de frango</span><span>R$ 36,00</span></div>'
            '<div><span>1× Bolo de cenoura</span><span>R$ 11,00</span></div>'
            '<div class="tot"><span>Total</span><span>R$ 115,00</span></div></div>'
            f'<div class="btn-wa">{ic("chat",15,"#fff",2)} Enviar pedido pelo WhatsApp</div>'
            '<div class="wa-note">Você revisa a mensagem e confirma o envio no WhatsApp.</div>'
            '</div>')

def screen_whats():
    return (statusbar(True) +
            f'<div class="wa-top">{ic("back",15,"#fff")}<span class="wa-av">SC</span><div><b>Sabor da Casa</b><span>conta comercial</span></div></div>'
            '<div class="wa-body"><div class="wa-date">Hoje</div>'
            '<div class="wa-hint">Mensagem preenchida automaticamente pelo site.<br>Basta revisar e tocar em enviar.</div>'
            '</div>'
            '<div class="wa-input"><div class="wa-msg">'
            '<b>Olá! Gostaria de fazer um pedido:</b><br>'
            '• 12× Brigadeiro gourmet — R$ 42,00<br>• 2× Bolo de pote — R$ 26,00<br>• 6× Coxinha de frango — R$ 36,00<br>• 1× Bolo de cenoura — R$ 11,00<br>'
            '<b>Total: R$ 115,00</b><br>Forma: <b>Entrega</b><br>Nome: Maria S.<br>Endereço: Rua das Flores, 120'
            f'</div><span class="wa-send">{ic("send",15,"#fff",2)}</span></div>')

def phone(content, zoom=1.0, cls="", style=""):
    return (f'<div class="pwrap {cls}" style="{style}"><div class="phone" style="zoom:{zoom}"><div class="ph-screen">{content}</div>'
            f'<div class="ph-notch"></div></div></div>')

def screen_desktop():
    prods = ["brigadeiro", "bolochocolate", "tortalimao", "coxinha"]
    return (f'<div class="d-nav"><span class="sdc-logo">Sabor <em>da</em> Casa</span>'
            '<span class="d-links"><b>Início</b><span>Cardápio</span><span>Encomendas</span><span>Sobre nós</span><span>Contato</span></span>'
            f'<span class="d-cart">{ic("bag",15)} Carrinho <b>2</b></span></div>'
            '<div class="d-hero"><div class="d-hero-t"><span class="hero-k dk">Feito em casa, todos os dias</span>'
            '<div class="d-h1">Sabores que<br>abraçam.</div>'
            '<p>Doces, salgados e bolos preparados com carinho. Escolha no cardápio e faça seu pedido pelo WhatsApp.</p>'
            '<span class="d-btns"><span class="btn-p sm">Ver cardápio</span><span class="btn-o sm">Como pedir</span></span></div>'
            '<div class="d-hero-i"><img src="food/hero2.jpg"></div></div>'
            '<div class="d-sec"><span class="d-sec-t">Mais pedidos</span>' + chips("Todos", ("Todos", "Doces", "Salgados", "Bolos", "Tortas", "Bolos de pote")) + '</div>'
            '<div class="d-grid">' + "".join(pcard(k) for k in prods) + '</div>')

def laptop(zoom=1.0, style=""):
    return (f'<div class="laptop" style="zoom:{zoom};{style}"><div class="lp-lid"><div class="lp-cam"></div><div class="lp-screen">'
            '<div class="br-bar"><i></i><i></i><i></i><span class="br-url">saboresdacasa.com.br</span></div>'
            f'<div class="lp-site">{screen_desktop()}</div></div></div><div class="lp-base"><div class="lp-notch"></div></div></div>')

# ---------------- MAGNES page chrome ----------------
def page_head(num, label, dark=False):
    logo = "logo-h-dark" if dark else "logo-h-color"
    return (f'<div class="ph-head"><img class="hd-logo" src="img/{logo}.png">'
            f'<span class="hd-meta">PROPOSTA COMERCIAL <i></i> {num}</span></div>')

def foot(dark=False):
    return f'<div class="foot{" dk" if dark else ""}"><span></span><span></span></div>'

def eyebrow(n, t, dark=False):
    return f'<div class="eyebrow{" dk" if dark else ""}"><b>{n}</b><span>{t}</span></div>'

# ---------------- pages ----------------
P = []

# 1 — Cover
P.append(f'''
<section class="page dark cover">
  <div class="bigE e-cover">e</div>
  <div class="cv-top"><img class="cv-logo" src="img/logo-h-dark.png"><span class="cv-meta">PROPOSTA COMERCIAL<br><b>WEBSITE · CATÁLOGO DIGITAL</b></span></div>
  <div class="cv-title">
    <div class="cv-kicker">Proposta comercial</div>
    <h1>Uma presença digital à altura do <span class="gold">teu negócio.</span></h1>
    <p class="cv-sub">Proposta de criação de website comercial com catálogo digital e pedidos via WhatsApp.</p>
  </div>
  <div class="cv-phones">
    <div class="glow"></div>
    {phone(screen_catalog(), .7, "ph-back")}
    {phone(screen_home(), .8, "ph-front")}
    <div class="cv-ill">{ILL_D}</div>
  </div>
  <div class="cv-sign"><span class="vr"></span><div><b>MAGNES</b><span>Agência Criativa</span></div></div>
  {foot(True)}
</section>''')

# 2 — A ideia
P.append(f'''
<section class="page light">
  <div class="bigE e-right">e</div>
  {page_head("02", "A ideia")}
  <div class="p2-grid">
    <div class="p2-text">
      {eyebrow("01", "A ideia")}
      <h2>O teu negócio merece estar mais perto dos clientes.</h2>
      <p class="lead">Ter um espaço digital próprio permite apresentar os produtos de forma organizada, valorizar a marca e facilitar o contato com os clientes.</p>
      <p>A proposta é criar um <b>website personalizado</b>, onde os clientes poderão explorar o catálogo, escolher os produtos e encaminhar as suas encomendas diretamente pelo WhatsApp.</p>
    </div>
    <div class="p2-visual">
      <div class="arch"><img src="food/hero_v.jpg"></div>
      <div class="p2-phone">{phone(screen_categories(), .62)}</div>
      <div class="p2-ill">{ILL}</div>
    </div>
  </div>
  <div class="benefits">
    <div class="bf"><span class="bf-n">01</span><div><h4>Mais organização</h4><p>Produtos apresentados de forma clara, por categorias, com fotos, descrições e preços.</p></div></div>
    <div class="bf"><span class="bf-n">02</span><div><h4>Compra simples e intuitiva</h4><p>Uma experiência fácil para o cliente escolher o que deseja, no próprio celular.</p></div></div>
    <div class="bf"><span class="bf-n">03</span><div><h4>Encomendas mais fáceis</h4><p>Pedidos chegam pelo WhatsApp já com os produtos e o resumo, prontos para organizar.</p></div></div>
  </div>
  {foot()}
</section>''')

# 3 — Como será o website
P.append(f'''
<section class="page light">
  {page_head("03", "O website")}
  {eyebrow("02", "Como será o website")}
  <h2 class="w80">Um espaço digital pensado para o teu negócio.</h2>
  <div class="p3-stage">
    <div class="p3-bg"><div class="bigE e-stage">e</div></div>
    {laptop(.62, "position:absolute;left:4mm;top:9mm")}
    <div style="position:absolute;right:6mm;top:2mm">{phone(screen_home(), .6)}</div>
    <div class="p3-ill">{ILL}</div>
  </div>
  <div class="p3-note">{ic("pen",13,"#D8A44E")} <span>Demonstração visual com a marca fictícia <b>“Sabor da Casa”</b>. O design final será criado de forma personalizada, com a identidade, as cores e os produtos do teu negócio.</span></div>
  <div class="p3-list">
    <div class="li">{ic("home",20,"#D8A44E")}<div><h5>Página inicial</h5><p>Apresentação do negócio, com destaque para o que há de melhor.</p></div></div>
    <div class="li">{ic("grid",20,"#D8A44E")}<div><h5>Catálogo digital</h5><p>Todos os produtos reunidos num só lugar, sempre à mão.</p></div></div>
    <div class="li">{ic("touch",20,"#D8A44E")}<div><h5>Categorias interativas</h5><p>Doces, salgados, bolos… o cliente encontra tudo com um toque.</p></div></div>
    <div class="li">{ic("photo",20,"#D8A44E")}<div><h5>Fotos, descrições e preços</h5><p>Informação clara para o cliente decidir com confiança.</p></div></div>
    <div class="li">{ic("devices",20,"#D8A44E")}<div><h5>Design responsivo</h5><p>Funciona bem em celulares, tablets e computadores.</p></div></div>
    <div class="li">{ic("check",20,"#D8A44E")}<div><h5>Navegação simples</h5><p>Caminhos curtos e intuitivos, sem complicação.</p></div></div>
  </div>
  {foot()}
</section>''')

# 4 — Funcionalidades
P.append(f'''
<section class="page light">
  {page_head("04", "Funcionalidades")}
  {eyebrow("03", "Funcionalidades")}
  <h2 class="w85">Mais do que apresentar produtos: facilitar pedidos.</h2>
  <div class="p4-band">
    <div class="bigE e-band">e</div>
    <div class="p4-ph"><div class="ph-cap"><b>Catálogo</b></div>{phone(screen_catalog(), .5)}</div>
    <div class="p4-ph mid"><div class="ph-cap"><b>Carrinho</b></div>{phone(screen_cart(), .5)}</div>
    <div class="p4-ph"><div class="ph-cap"><b>Finalização</b></div>{phone(screen_checkout(), .5)}</div>
    <div class="p4-ill">{ILL_D}</div>
  </div>
  <div class="feats">
    <div class="ft">{ic("grid",18,"#0D0D0D")}<div><h5>Catálogo interativo</h5><p>Os produtos serão organizados por categorias, para o cliente encontrar facilmente o que procura.</p></div></div>
    <div class="ft">{ic("cart",18,"#0D0D0D")}<div><h5>Carrinho de compras</h5><p>O visitante poderá adicionar produtos, escolher quantidades e ver o resumo do pedido.</p></div></div>
    <div class="ft wide">{ic("chat",18,"#0D0D0D")}<div><h5>Pedidos via WhatsApp</h5><p>Ao finalizar, o cliente é encaminhado para o WhatsApp com uma mensagem já preenchida com os produtos selecionados e o resumo da encomenda. <b>O envio final é confirmado pelo próprio cliente, no WhatsApp.</b></p></div></div>
    <div class="ft">{ic("truck",18,"#0D0D0D")}<div><h5>Entrega ou retirada</h5><p>O cliente escolhe se prefere receber o pedido ou retirá-lo pessoalmente.</p></div></div>
    <div class="ft">{ic("save",18,"#0D0D0D")}<div><h5>Carrinho guardado</h5><p>Os produtos adicionados ficam guardados no mesmo aparelho, para continuar a navegação mais tarde.</p></div></div>
  </div>
  {foot()}
</section>''')

# 5 — Jornada
steps = [
    ("Entra no website", "Pelo link, em qualquer celular.", screen_home()),
    ("Explora as categorias", "Doces, salgados, bolos e mais.", screen_categories()),
    ("Escolhe os produtos", "Fotos, descrições e preços.", screen_catalog()),
    ("Adiciona ao carrinho", "Ajusta as quantidades com facilidade.", screen_cart()),
    ("Entrega ou retirada", "Escolhe como prefere receber.", screen_checkout()),
    ("Finaliza pelo WhatsApp", "Revisa a mensagem e confirma o envio.", screen_whats()),
]
st_html = "".join(
    f'<div class="st"><div class="st-ph">{phone(sc, .43)}</div><div class="st-t"><span class="st-n">{i+1:02d}</span><div><h5>{t}</h5><p>{d}</p></div></div></div>'
    for i, (t, d, sc) in enumerate(steps))
P.append(f'''
<section class="page light">
  <div class="bigE e-left">e</div>
  {page_head("05", "Experiência")}
  {eyebrow("04", "Experiência de compra")}
  <h2 class="w85">Uma jornada simples, do primeiro clique ao pedido.</h2>
  <p class="lead w80">A experiência será pensada <b>prioritariamente para celulares</b>, para um acesso rápido e confortável, onde quer que o cliente esteja.</p>
  <div class="p5-ill">{ILL}</div>
  <div class="steps">{st_html}</div>
  {foot()}
</section>''')

# 6 — Incluído
inc = [("plan", "Planejamento e estruturação do website"), ("pen", "Design personalizado"), ("code", "Desenvolvimento do website comercial"),
       ("list", "Organização do catálogo digital"), ("tag", "Configuração de até 20 produtos iniciais"), ("touch", "Implementação de categorias interativas"),
       ("cart", "Carrinho de compras"), ("chat", "Integração com WhatsApp"), ("form", "Formulário de encomenda"),
       ("truck", "Configuração das opções de entrega e retirada"), ("devices", "Adaptação para celulares e computadores"),
       ("test", "Testes de funcionamento"), ("rocket", "Publicação do website e link público")]
inc_html = "".join(f'<div class="inc"><span class="inc-n">{i+1:02d}</span>{ic(k,15,"#D8A44E")}<span class="inc-t">{t}</span></div>' for i, (k, t) in enumerate(inc))
P.append(f'''
<section class="page light p6">
  <div class="p6-side">
    <div class="bigE e-side">e</div>
    <img class="hd-logo" src="img/logo-h-dark.png">
    <div class="p6-side-in">
      {eyebrow("05", "Entregáveis", True)}
      <h2 class="lt">Tudo o que precisas para começar.</h2>
      <p class="lt-p">Um projeto completo, do planejamento à publicação, para o teu negócio ter um espaço digital pronto para receber pedidos.</p>
      <div class="p6-badge"><b>20</b><span>produtos iniciais<br>configurados</span></div>
    </div>
    <span class="p6-pg">PROPOSTA COMERCIAL <i></i> 06</span>
  </div>
  <div class="p6-list">
    <div class="p6-lh">O que está incluído</div>
    {inc_html}
  </div>
  {foot()}
</section>''')

# 7 — Investimento
P.append(f'''
<section class="page light">
  <div class="bigE e-right2">e</div>
  {page_head("07", "Investimento")}
  {eyebrow("06", "Investimento")}
  <h2 class="w80">Investimento no teu novo espaço digital.</h2>
  <div class="price">
    <div class="bigE e-price">e</div>
    <div class="pr-l">
      <span class="pr-tag">Condição comercial especial para este projeto</span>
      <div class="pr-v"><small>R$</small>870<small>,00</small></div>
      <p>O valor inclui o desenvolvimento e a publicação do website, dentro do escopo apresentado nesta proposta.</p>
    </div>
    <div class="pr-r">
      <div class="pr-h">Condições de pagamento</div>
      <div class="pay"><span class="pay-d"></span><div><b>50% na aprovação da proposta</b><span>R$ 435,00</span></div></div>
      <div class="pay"><span class="pay-d"></span><div><b>50% antes da publicação final</b><span>R$ 435,00</span></div></div>
    </div>
  </div>
  <div class="terms">
    <div class="tm">
      <div class="tm-h">{ic("clock",15,"#D8A44E")} Prazo estimado</div>
      <div class="tm-big">7 a 15 <span>dias úteis</span></div>
      <p>Contados a partir do recebimento de todos os materiais e informações necessários.</p>
    </div>
    <div class="tm">
      <div class="tm-h">{ic("check",15,"#D8A44E")} Incluído no projeto</div>
      <ul class="ok"><li>Até <b>2 rodadas de ajustes</b> durante o desenvolvimento.</li>
      <li><b>30 dias de suporte técnico</b> após a publicação, para correção de eventuais falhas relacionadas com o projeto entregue.</li></ul>
    </div>
    <div class="tm">
      <div class="tm-h">{ic("x",15,"#8a8a8a")} Não incluído</div>
      <ul class="no"><li>Domínio próprio, caso desejado.</li><li>Serviços pagos de terceiros.</li><li>Mensalidades de plataformas ou serviços externos.</li><li>Gestão mensal do website.</li><li>Funcionalidades adicionais não descritas nesta proposta.</li></ul>
    </div>
  </div>
  <div class="p7-note">{ic("shield",14,"#D8A44E")} Qualquer custo externo será comunicado previamente, antes de qualquer contratação.</div>
  <div class="tl-h">Como o projeto acontece</div>
  <div class="tl">
    <div class="tl-s"><i></i><b>Aprovação</b><span>Proposta aprovada e 1ª parcela (R$ 435,00)</span></div>
    <div class="tl-s"><i></i><b>Materiais</b><span>Envio de fotos, preços e informações</span></div>
    <div class="tl-s"><i></i><b>Desenvolvimento</b><span>Design, catálogo e até 2 rodadas de ajustes</span></div>
    <div class="tl-s"><i></i><b>Publicação</b><span>2ª parcela (R$ 435,00) e link público no ar</span></div>
    <div class="tl-s"><i></i><b>Suporte</b><span>30 dias para correção de eventuais falhas</span></div>
  </div>
  {foot()}
</section>''')

# 8 — Continuidade
cont = [("refresh", "Atualização de preços e informações"), ("swap", "Inclusão, remoção ou substituição de produtos"), ("photo", "Atualização de fotografias"),
        ("pen", "Pequenos ajustes visuais e de conteúdo"), ("shield", "Verificação periódica do funcionamento"), ("help", "Apoio em pequenas necessidades do site")]
cont_html = "".join(f'<div class="ct">{ic(k,18,"#D8A44E")}<span>{t}</span></div>' for k, t in cont)
P.append(f'''
<section class="page stone">
  <div class="p8-pattern"></div>
  {page_head("08", "Continuidade")}
  {eyebrow("07", "Continuidade")}
  <h2 class="w80">Um website bem cuidado continua a trabalhar pelo teu negócio.</h2>
  <div class="p8-grid">
    <div class="p8-text">
      <p class="lead">Depois da publicação, o website poderá continuar a evoluir com o negócio.</p>
      <p>A MAGNES poderá disponibilizar um <b>serviço opcional de manutenção e acompanhamento</b>, pensado para manter o website atualizado, organizado e funcional ao longo do tempo.</p>
    </div>
    <div class="p8-quote"><span class="q">“</span>Continuamos por perto, mesmo depois da entrega.</div>
  </div>
  <div class="p8-lh">Exemplos do que poderá incluir</div>
  <div class="conts">{cont_html}</div>
  <div class="opt">
    <span class="opt-tag">Opcional</span>
    <p>Serviço a contratar futuramente, se fizer sentido para o negócio, mediante orçamento ou plano mensal. <b>Não está incluído no investimento de R$ 870,00</b> apresentado nesta proposta.</p>
  </div>
  {foot()}
</section>''')

# 9 — Encerramento
P.append(f'''
<section class="page dark closing">
  <div class="bigE e-close">e</div>
  <div class="cl-in">
    {eyebrow("08", "Próximo passo", True)}
    <h1 class="cl-h">Vamos dar o<br><span class="gold">próximo passo?</span></h1>
    <p class="cl-p">O objetivo é criar um espaço digital que represente o teu negócio, valorize os teus produtos e torne o processo de encomenda mais simples para os teus clientes.</p>
    <p class="cl-p em">Será um prazer fazer parte desta evolução.</p>
    <div class="cta">
      <div class="cta-h">Como aprovar a proposta</div>
      <div class="cta-steps">
        <div><b>1</b><span>Confirma a aprovação pelo WhatsApp</span></div>
        <div><b>2</b><span>Pagamento da primeira parcela de 50% (R$ 435,00)</span></div>
        <div><b>3</b><span>Envio dos materiais e início do projeto</span></div>
      </div>
      <div class="cta-btn">Aprovar proposta {ic("arrow",16,"#0D0D0D",2.2)}</div>
    </div>
  </div>
  <div class="cl-sign">
    <img src="img/logo-v-dark.png">
    <div class="cl-contacts">
      <span>{ic("insta",13,"#D8A44E")} @magnesagencia</span>
      <span>{ic("mail",13,"#D8A44E")} agenciamagnes@gmail.com</span>
    </div>
  </div>
  <p class="cl-final">Estratégia, criatividade e presença digital<br>para negócios que querem crescer.</p>
  {foot(True)}
</section>''')

css = open(os.path.join(HERE, "style.css")).read()
html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta Comercial — MAGNES</title>
<style>{css}</style></head><body>{"".join(P)}</body></html>'''
open(os.path.join(HERE, "proposta.html"), "w").write(html)
print("built", len(html))

from core.redaction import mask_phone


def test_deja_reconocible_el_numero_sin_exponerlo():
    assert mask_phone("+5215512345678") == "+52*******5678"
    assert mask_phone("5512345678") == "55****5678"


def test_ignora_separadores():
    """El mismo número tiene que dar el mismo resultado venga como venga formateado."""
    for variante in ["+52 155 1234 5678", "+52-155-1234-5678", "+5215512345678"]:
        assert mask_phone(variante) == "+52*******5678"


def test_oculta_por_completo_los_numeros_cortos():
    assert mask_phone("+521234") == "+******"
    assert mask_phone("123") == "***"


def test_nunca_devuelve_el_numero_original():
    for phone in ["+5215512345678", "5512345678", "+14155552671", "123"]:
        assert mask_phone(phone) != phone


def test_tolera_entradas_vacias_o_invalidas():
    assert mask_phone(None) == "<sin número>"
    assert mask_phone("") == "<sin número>"
    assert mask_phone("   ") == "<sin número>"
    assert mask_phone("sin-dígitos") == "<número inválido>"


def test_coincide_con_la_implementacion_del_gateway():
    """
    Los dos servicios escriben en el mismo Cloud Logging. Si el enmascarado difiere,
    el mismo cliente aparece con dos identificadores distintos y deja de poder
    correlacionarse. Estos vectores son los mismos que los de mask-phone.spec.ts.
    """
    vectores = {
        "+5215512345678": "+52*******5678",
        "5512345678": "55****5678",
        "+521234": "+******",
        "123": "***",
        "": "<sin número>",
        "sin-dígitos": "<número inválido>",
    }
    for entrada, esperado in vectores.items():
        assert mask_phone(entrada) == esperado

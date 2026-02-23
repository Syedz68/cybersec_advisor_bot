from django.contrib import admin
from django.urls import path
from advisor import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.landing_page, name="landing_page"),  # API landing page
    path("api/ingest/url", views.ingest_url, name="ingest_url"),
    path("api/ingest/pdf", views.ingest_pdf, name="ingest_pdf"),
    path("api/ask", views.ask, name="ask"),
    path("api/integrity", views.check_integrity, name="check_integrity"),
    path("api/analyze/email", views.analyze_email, name="analyze_email"),
    path("api/analyze/image", views.analyze_image, name="analyze_image"),
]

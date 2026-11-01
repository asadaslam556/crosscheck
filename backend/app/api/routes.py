"""HTTP layer. Each route validates its inputs and hands straight to the service."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_session
from app.metrics import service
from app.metrics.queries import DIMENSIONS

router = APIRouter(prefix="/api")

SessionDep = Annotated[Session, Depends(get_session)]
Scorer = Literal["llm", "rule"]

ExcludeFamily = Annotated[
    str | None,
    Query(
        description="Drop one job family before computing. Use Healthcare to see the "
        "platform without the rule scorer's broken segment.",
    ),
]
RescaleFamily = Annotated[
    str | None,
    Query(
        description="Scale one family's rule scores up to the level of the others before "
        "computing. Use Healthcare to simulate the proposed normalisation fix.",
    ),
]
Dimension = Annotated[str, Query(description=f"One of: {', '.join(DIMENSIONS)}")]


@router.get("/health", response_model=schemas.Health, responses={503: {"model": schemas.Health}})
def health(session: SessionDep):
    # Touches the database, so a container that is up but cannot reach Postgres reports it.
    try:
        return service.health(session)
    except SQLAlchemyError:
        return JSONResponse(status_code=503, content={"status": "unavailable"})


@router.get("/overview", response_model=schemas.Overview)
def get_overview(session: SessionDep):
    return service.overview(session)


@router.get("/effectiveness", response_model=schemas.Effectiveness)
def get_effectiveness(
    session: SessionDep,
    exclude_family: ExcludeFamily = None,
    rescale_family: RescaleFamily = None,
):
    return service.effectiveness(
        session, exclude_family=exclude_family, rescale_family=rescale_family
    )


@router.get("/within-job", response_model=schemas.WithinJob)
def get_within_job(session: SessionDep):
    return service.within_job(session)


@router.get("/agreement", response_model=schemas.Agreement)
def get_agreement(session: SessionDep, exclude_family: ExcludeFamily = None):
    return service.agreement(session, exclude_family=exclude_family)


@router.get("/segments", response_model=schemas.Segments)
def get_segments(
    session: SessionDep,
    dimension: Dimension = "job_family",
    by: Annotated[str | None, Query(description="Optional second dimension")] = None,
):
    try:
        return service.segments(session, dimension=dimension, by=by)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/calibration", response_model=schemas.Calibration)
def get_calibration(
    session: SessionDep,
    scorer: Scorer = "llm",
    exclude_family: ExcludeFamily = None,
):
    return service.calibration(session, scorer=scorer, exclude_family=exclude_family)


@router.get("/threshold-sweep", response_model=schemas.ThresholdSweep)
def get_threshold_sweep(session: SessionDep, scorer: Scorer = "llm"):
    return service.sweep(session, scorer=scorer)


@router.get("/drift", response_model=schemas.Drift)
def get_drift(session: SessionDep):
    return service.drift(session)


@router.get("/recruiter-behaviour", response_model=schemas.RecruiterBehaviour)
def get_recruiter_behaviour(session: SessionDep):
    return service.recruiter_behaviour(session)


@router.get("/quality-gate", response_model=schemas.QualityGate)
def get_quality_gate(session: SessionDep):
    return service.quality_gate(session)


@router.get("/data-quality", response_model=schemas.DataQuality)
def get_data_quality(session: SessionDep):
    return service.data_quality(session)


@router.get("/third-opinion", response_model=schemas.ThirdOpinion)
def get_third_opinion(session: SessionDep):
    return service.third_opinion(session)

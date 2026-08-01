class AppError(Exception):
    def __init__(self, detail: str, code: int = 400):
        self.detail = detail
        self.code = code
        super().__init__(self.detail)

class BadRequestError(AppError):
    def __init__(self, detail: str):
        super().__init__(detail, 400)

class UnauthorizedError(AppError):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(detail, 401)

class ForbiddenError(AppError):
    def __init__(self, detail: str = "Access denied"):
        super().__init__(detail, 403)

class NotFoundError(AppError):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(detail, 404)

class ConflictError(AppError):
    def __init__(self, detail: str = "Resource conflict"):
        super().__init__(detail, 409)

class UnprocessableError(AppError):
    def __init__(self, detail: str = "Unprocessable entity"):
        super().__init__(detail, 422)

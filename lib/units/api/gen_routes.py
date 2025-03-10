import os
import yaml
import pathlib
import json

SPEC_FILE = pathlib.Path("./swagger/api_v1.yaml")
ROUTES_DIR = pathlib.Path("./paths").absolute()
CONTROLLERS_PATH = pathlib.Path("./controllers").absolute()

with open(SPEC_FILE) as stream:
  spec = yaml.safe_load(stream)

for path, path_obj in spec["paths"].items():
  if path == "/swagger.json":
    continue
  route: pathlib.Path = (ROUTES_DIR / path.lstrip("/"))
  print(route)
  route = route.with_suffix(".js")
  route.parent.mkdir(exist_ok=True, parents=True)
  with open(route, "w") as route_file:
    controller = None
    operations = {}
    for method, method_obj in path_obj.items():
      if method == "x-swagger-router-controller":
        controller = method_obj
      else:
        operations[method] = method_obj["operationId"]
    controller_f: pathlib.Path = (CONTROLLERS_PATH / controller).with_suffix(".js")
    route_file.write(f"// {controller}\n")
    route_file.write(f"""
import {{{", ".join(operations.values())}}} from '{os.path.relpath(controller_f, route.parent)}'
""")
    for method, func in operations.items():
      route_file.write(f"""
export function {method.replace('delete', 'del')}(req, res, next) {{
    return {func}(req, res, next)
}}

""")
    route_file.write("\n")


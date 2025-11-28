module Simple (add, greet) where

import Prelude
import Data.Maybe (Maybe(..))

add :: Int -> Int -> Int
add x y = x + y

greet :: String -> String
greet name = "hi " <> name
